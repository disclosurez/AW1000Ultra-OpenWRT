// Command wvcgi serves the web viewer through uhttpd's CGI interface.
//
// The viewer itself listens on plain HTTP (LAN port 8090). Browsers refuse to
// frame that from an HTTPS LuCI page, so when the console is opened over HTTPS
// the page uses this CGI instead: the request reaches uhttpd on the same
// origin (and through the same Cloudflare tunnel / Access session), and this
// program relays it to 127.0.0.1:8090 and prefixes the viewer's root-relative
// URLs with /cgi-bin/webview so links stay inside the CGI.
package main

import (
	"io"
	"log"
	"net/http"
	"net/http/cgi"
	"os"
	"regexp"
	"strings"
	"time"
)

const (
	prefix  = "/cgi-bin/webview"
	maxBody = 32 << 20
)

var portRe = regexp.MustCompile(`(?m)^\s*option\s+port\s+['"]?([0-9]+)['"]?`)

var client = &http.Client{
	Timeout: 120 * time.Second,
	// The viewer does not currently redirect, but a proxied form post may grow
	// one later; pass redirects through to the browser instead of following.
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

func main() {
	log.SetFlags(0)
	if err := cgi.Serve(http.HandlerFunc(handle)); err != nil {
		log.Fatal(err)
	}
}

func handle(w http.ResponseWriter, r *http.Request) {
	// PATH_INFO is everything after /cgi-bin/webview. SCRIPT_NAME is fixed by
	// uhttpd, but do not trust it for routing: the page is always at prefix.
	info := os.Getenv("PATH_INFO")
	if info == "" {
		info = "/"
	} else if !strings.HasPrefix(info, "/") {
		info = "/" + info
	}
	target := "http://127.0.0.1:" + viewerPort() + info
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadGateway)
		return
	}
	req.Header = r.Header.Clone()
	req.Header.Del("Host")
	req.Header.Del("Content-Length")
	req.ContentLength = r.ContentLength

	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "viewer unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	text := isText(resp.Header.Get("Content-Type"))
	for k, vv := range resp.Header {
		ck := http.CanonicalHeaderKey(k)
		switch ck {
		case "Content-Length", "Transfer-Encoding", "Connection":
			// The body may be rewritten, and uhttpd frames CGI output itself.
			continue
		case "Location":
			for _, v := range vv {
				w.Header().Add(ck, location(v))
			}
			continue
		case "Refresh":
			for _, v := range vv {
				w.Header().Add(ck, refreshLocation(v))
			}
			continue
		}
		for _, v := range vv {
			w.Header().Add(ck, v)
		}
	}

	if !text {
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
		return
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	if err != nil {
		http.Error(w, "viewer read failed", http.StatusBadGateway)
		return
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(rewrite(raw))
}

func isText(ct string) bool {
	ct = strings.ToLower(ct)
	return strings.HasPrefix(ct, "text/html") ||
		strings.HasPrefix(ct, "application/xhtml+xml") ||
		strings.HasPrefix(ct, "text/css")
}

// viewerPort follows webview.settings.port so changing the gateway port in
// LuCI does not leave the bridge pointing at a dead socket.
func viewerPort() string {
	if b, err := os.ReadFile("/etc/config/webview"); err == nil {
		return portFrom(b)
	}
	return "8090"
}

func portFrom(cfg []byte) string {
	if m := portRe.FindSubmatch(cfg); m != nil {
		return string(m[1])
	}
	return "8090"
}

// rewrite prefixes the viewer's own root-relative URLs. The gateway resolves
// every upstream link before emitting it, so "/go" and "/raw" here are always
// the viewer's routes, never a proxied site's paths.
func rewrite(body []byte) []byte {
	return []byte(rootRefs.Replace(string(body)))
}

func location(v string) string {
	if strings.HasPrefix(v, "/") && !strings.HasPrefix(v, "//") && !strings.HasPrefix(v, prefix+"/") {
		return prefix + v
	}
	return v
}

// refreshLocation prefixes the URL part of a Refresh header (the viewer
// rewrites it to "/go?wv_u=…" when a site redirects client-side).
func refreshLocation(v string) string {
	i := strings.Index(strings.ToLower(v), "url=")
	if i < 0 {
		return v
	}
	return v[:i+4] + location(strings.TrimSpace(v[i+4:]))
}

var rootRefs = strings.NewReplacer(
	`href="/"`, `href="`+prefix+`/"`,

	// The viewer's own routes always carry a query string; match only that so
	// inline-script strings like "/google..." are not rewritten by accident.
	`action="/go"`, `action="`+prefix+`/go"`,
	`"/go?`, `"`+prefix+`/go?`,
	`'/go?`, `'`+prefix+`/go?`,
	`(/go?`, `(`+prefix+`/go?`,

	`"/raw?`, `"`+prefix+`/raw?`,
	`'/raw?`, `'`+prefix+`/raw?`,
	`(/raw?`, `(`+prefix+`/raw?`,
	// srcset entries after the first are joined with ", ".
	`, /raw?`, `, `+prefix+`/raw?`,
)
