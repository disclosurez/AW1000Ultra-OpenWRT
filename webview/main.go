// webview — a small link-rewriting web gateway.
//
// You give it a URL; the router fetches the page and serves it back with
// links, forms, images and stylesheets rewritten to pass through the gateway,
// so the site sees the router's address instead of the client's.
//
//	GET  /                      URL bar
//	GET  /go?u=<b64|url>        fetch a page (GET)
//	POST /go?u=<b64|url>        forward a form submission
//	GET  /raw?u=<b64>           assets: images, css, js, fonts, media
//
// Deliberately dependency-free apart from golang.org/x/net/html. It is a
// rewriting proxy, not a browser: HTML, CSS, forms and cookies work, pages
// that need client-side JS apps generally will not.
package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"golang.org/x/net/html"
	"golang.org/x/net/publicsuffix"
)

const (
	userAgent  = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
	maxHTML    = 12 << 20 // 12 MiB page cap
	homePath   = "/"
	assetRoute = "/raw"
	pageRoute  = "/go"
	// targetParam carries the proxied URL. It is deliberately unlikely to
	// collide with a site's own field names (unlike "u", which some sites use
	// for a username).
	targetParam = "wv_u"
)

type session struct {
	client *http.Client
	last   time.Time
	// base is the last page this browser session opened, used only to resolve
	// navigations that escaped the rewriter (client-side JavaScript building
	// root-relative URLs). It lives in RAM, is never logged, never written to
	// flash and disappears with the session.
	base *url.URL
}

var (
	sessMu   sync.Mutex
	sessions = map[string]*session{}

	localAddr  string
	showBadge  = true
	socketMark int
)

func main() {
	addr := flag.String("addr", "0.0.0.0:8090", "listen address")
	mark := flag.Int("mark", 0, "SO_MARK for outbound sockets (routes via the VPN policy table)")
	flag.BoolVar(&showBadge, "badge", true, "inject a home button into proxied pages")
	flag.Parse()
	localAddr = *addr
	socketMark = *mark

	go cleanupSessions()

	mux := http.NewServeMux()
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Privacy: the viewer keeps no history. Nothing is written to disk,
		// URLs are never logged, and every response tells the browser not to
		// store it or send the upstream page to a third party (same-origin
		// keeps the Referer only between the gateway and the browser, which is
		// what lets an escaped click be resolved).
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "same-origin")
		switch r.URL.Path {
		case homePath:
			handleHome(w, r)
		case pageRoute:
			handlePage(w, r)
		case assetRoute:
			handleAsset(w, r)
		case "/favicon.ico":
			w.WriteHeader(http.StatusNoContent)
		default:
			// A path we did not write: almost always a root-relative URL built
			// by the site's JavaScript. Resolve it against the page the
			// browser came from instead of letting the router answer 404/400.
			handleEscaped(w, r)
		}
	})
	mux.Handle("/", h)

	srv := &http.Server{
		Addr: *addr,
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Deliberately no X-Frame-Options: the LuCI page embeds the
			// viewer in an iframe, and XFO compares scheme+host+port, so
			// SAMEORIGIN would block :80 -> :8090. The gateway is LAN-bound.
			mux.ServeHTTP(w, r)
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("webview listening on %s", *addr)
	log.Fatal(srv.ListenAndServe())
}

func cleanupSessions() {
	for {
		time.Sleep(5 * time.Minute)
		sessMu.Lock()
		for id, s := range sessions {
			if time.Since(s.last) > 30*time.Minute {
				delete(sessions, id)
			}
		}
		sessMu.Unlock()
	}
}

// markControl sets SO_MARK on every outbound socket, so the kernel routes the
// viewer through the policy table without an iptables owner rule.
func markControl(mark int) func(string, string, syscall.RawConn) error {
	return func(_, _ string, c syscall.RawConn) error {
		var serr error
		if err := c.Control(func(fd uintptr) {
			serr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_MARK, mark)
		}); err != nil {
			return err
		}
		return serr
	}
}

func newClient(jar http.CookieJar) *http.Client {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.MaxIdleConns = 16
	tr.IdleConnTimeout = 60 * time.Second
	if socketMark != 0 {
		d := &net.Dialer{Timeout: 20 * time.Second, Control: markControl(socketMark)}
		tr.DialContext = d.DialContext
	}
	return &http.Client{
		Transport: tr,
		Jar:       jar,
		Timeout:   35 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
}

func randID(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func getSession(w http.ResponseWriter, r *http.Request) *session {
	sid := ""
	if c, err := r.Cookie("wv_sid"); err == nil {
		sid = c.Value
	}
	sessMu.Lock()
	s := sessions[sid]
	if s == nil {
		sid = randID(16)
		jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
		s = &session{client: newClient(jar)}
		sessions[sid] = s
		http.SetCookie(w, &http.Cookie{
			Name: "wv_sid", Value: sid, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode,
		})
	}
	s.last = time.Now()
	sessMu.Unlock()
	return s
}

// setSessionBase remembers the last page for this session, in RAM only.
func setSessionBase(s *session, u *url.URL) {
	if s == nil || u == nil {
		return
	}
	sessMu.Lock()
	s.base = u
	sessMu.Unlock()
}

// upstreamFromViewerURL turns a gateway URL (…/go?u=<b64> or …/cgi-bin/webview/go?u=…)
// back into the site URL it proxied.
func upstreamFromViewerURL(g *url.URL) *url.URL {
	if g == nil {
		return nil
	}
	raw := g.Query().Get(targetParam)
	if raw == "" {
		raw = g.Query().Get("u")
	}
	if raw == "" {
		return nil
	}
	s, err := dec(raw)
	if err != nil {
		return nil
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil
	}
	return u
}

// sourcePage is the site page a click started from. It prefers the browser's
// Referer (decode the gateway URL inside it), then the session's last page.
func sourcePage(r *http.Request) *url.URL {
	if ref := r.Header.Get("Referer"); ref != "" {
		if g, err := url.Parse(ref); err == nil {
			if u := upstreamFromViewerURL(g); u != nil {
				return u
			}
		}
	}
	if c, err := r.Cookie("wv_sid"); err == nil {
		sessMu.Lock()
		s := sessions[c.Value]
		var u *url.URL
		if s != nil {
			u = s.base
		}
		sessMu.Unlock()
		return u
	}
	return nil
}

func embedRequest(r *http.Request) bool {
	if r.URL.Query().Get("e") == "1" {
		return true
	}
	if ref := r.Header.Get("Referer"); ref != "" {
		if g, err := url.Parse(ref); err == nil {
			return g.Query().Get("e") == "1"
		}
	}
	return false
}

// handleEscaped takes a request the rewriter did not produce — typically a
// root-relative URL built by the site's JavaScript — and sends it to the same
// site instead of letting the router's web server answer 404/400.
func handleEscaped(w http.ResponseWriter, r *http.Request) {
	base := sourcePage(r)
	if base == nil {
		http.NotFound(w, r)
		return
	}
	target := &url.URL{
		Scheme:   base.Scheme,
		Host:     base.Host,
		Path:     r.URL.Path,
		RawQuery: r.URL.RawQuery,
	}
	q := url.Values{targetParam: {enc(target.String())}}
	if embedRequest(r) {
		q.Set("e", "1")
	}
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		http.Redirect(w, r, pageRoute+"?"+q.Encode(), http.StatusFound)
		return
	}
	// A form or fetch POST cannot be redirected without losing its body, so
	// proxy it in place through the normal page handler.
	r2 := r.Clone(r.Context())
	r2.URL = &url.URL{Path: pageRoute, RawQuery: q.Encode()}
	handlePage(w, r2)
}

func enc(u string) string { return base64.RawURLEncoding.EncodeToString([]byte(u)) }

func dec(s string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func normalizeTarget(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("empty URL")
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("only http and https are allowed")
	}
	if u.Host == "" {
		return "", fmt.Errorf("URL has no host")
	}
	return u.String(), nil
}

// targetFromRequest accepts /go?wv_u=<base64> (links we wrote), the older
// /go?u=<base64>, or /go?url=<plain> (the URL bar).
func targetFromRequest(r *http.Request) (string, error) {
	for _, k := range []string{targetParam, "u"} {
		if b := r.URL.Query().Get(k); b != "" {
			if s, err := dec(b); err == nil {
				return normalizeTarget(s)
			}
		}
	}
	return normalizeTarget(r.URL.Query().Get("url"))
}

var (
	cssURL    = regexp.MustCompile(`(?i)url\(\s*([^)]*?)\s*\)`)
	cssImport = regexp.MustCompile(`(?i)@import\s+([^;]+);`)
)

func rewriteRef(base *url.URL, raw, kind string, embed bool) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return raw
	}
	low := strings.ToLower(raw)
	switch {
	case strings.HasPrefix(low, "javascript:"), strings.HasPrefix(low, "mailto:"),
		strings.HasPrefix(low, "tel:"), strings.HasPrefix(low, "data:"),
		strings.HasPrefix(low, "about:"), strings.HasPrefix(low, "blob:"):
		return raw
	case strings.HasPrefix(raw, "#"):
		return raw
	}
	ref, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	abs := base.ResolveReference(ref)
	if abs.Scheme != "http" && abs.Scheme != "https" {
		return raw
	}
	route := assetRoute
	if kind != "asset" {
		route = pageRoute
	}
	frag := abs.Fragment
	abs.Fragment = ""
	u := route + "?" + targetParam + "=" + enc(abs.String())
	if embed && kind != "asset" {
		u += "&e=1"
	}
	if frag != "" {
		return u + "#" + frag
	}
	return u
}

func rewriteCSS(css string, base *url.URL) string {
	css = cssURL.ReplaceAllStringFunc(css, func(m string) string {
		sub := cssURL.FindStringSubmatch(m)
		if len(sub) != 2 {
			return m
		}
		v := strings.Trim(strings.TrimSpace(sub[1]), `"'`)
		if v == "" || strings.HasPrefix(strings.ToLower(v), "data:") {
			return m
		}
		return "url(" + rewriteRef(base, v, "asset", false) + ")"
	})
	css = cssImport.ReplaceAllStringFunc(css, func(m string) string {
		sub := cssImport.FindStringSubmatch(m)
		if len(sub) != 2 {
			return m
		}
		v := strings.Trim(strings.TrimSpace(sub[1]), `"'`)
		if v == "" || strings.HasPrefix(strings.ToLower(v), "url(") {
			return m
		}
		return `@import "` + rewriteRef(base, v, "asset", false) + `";`
	})
	return css
}

func rewriteSrcset(v string, base *url.URL, embed bool) string {
	parts := strings.Split(v, ",")
	for i, p := range parts {
		fields := strings.Fields(strings.TrimSpace(p))
		if len(fields) == 0 {
			continue
		}
		fields[0] = rewriteRef(base, fields[0], "asset", false)
		parts[i] = strings.Join(fields, " ")
	}
	return strings.Join(parts, ", ")
}

func refKind(tag, key string) string {
	switch strings.ToLower(key) {
	case "action", "formaction":
		return "nav"
	case "src":
		switch strings.ToLower(tag) {
		case "iframe", "frame":
			return "frame"
		}
	case "href":
		switch strings.ToLower(tag) {
		case "a", "area":
			return "nav"
		}
	}
	return "asset"
}

func findBody(n *html.Node) *html.Node {
	if n.Type == html.ElementNode && strings.EqualFold(n.Data, "body") {
		return n
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if b := findBody(c); b != nil {
			return b
		}
	}
	return nil
}

func setAttr(n *html.Node, key, val string) {
	for i := range n.Attr {
		if strings.EqualFold(n.Attr[i].Key, key) {
			n.Attr[i].Val = val
			return
		}
	}
	n.Attr = append(n.Attr, html.Attribute{Key: key, Val: val})
}

func hiddenInput(name, value string) *html.Node {
	return &html.Node{Type: html.ElementNode, Data: "input", Attr: []html.Attribute{
		{Key: "type", Val: "hidden"},
		{Key: "name", Val: name},
		{Key: "value", Val: value},
	}}
}

func dropInputNamed(n *html.Node, name string) {
	for c := n.FirstChild; c != nil; {
		next := c.NextSibling
		if c.Type == html.ElementNode && strings.EqualFold(c.Data, "input") {
			for _, a := range c.Attr {
				if strings.EqualFold(a.Key, "name") && a.Val == name {
					n.RemoveChild(c)
					break
				}
			}
		}
		c = next
	}
}

func rewriteHTML(body []byte, base *url.URL, notice string, embed bool) ([]byte, error) {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return body, err
	}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch strings.ToLower(n.Data) {
			case "base":
				n.Parent.RemoveChild(n)
				return
			case "meta":
				// Drop CSP and refresh tags that would bypass the gateway, and
				// a site referrer policy that would fight the gateway's own.
				var drop bool
				for _, a := range n.Attr {
					k := strings.ToLower(a.Key)
					if k == "http-equiv" {
						v := strings.ToLower(a.Val)
						if v == "content-security-policy" || v == "refresh" {
							drop = true
						}
					}
					if k == "name" && strings.EqualFold(a.Val, "referrer") {
						drop = true
					}
				}
				if drop {
					n.Parent.RemoveChild(n)
					return
				}
			}
			for i := range n.Attr {
				a := &n.Attr[i]
				k := strings.ToLower(a.Key)
				switch k {
				case "href", "src", "poster", "data-src", "data-href", "formaction":
					a.Val = rewriteRef(base, a.Val, refKind(n.Data, k), embed)
				case "srcset", "data-srcset":
					a.Val = rewriteSrcset(a.Val, base, embed)
				case "integrity", "nonce":
					a.Val = ""
				case "style":
					a.Val = rewriteCSS(a.Val, base)
				}
			}
			if strings.EqualFold(n.Data, "style") && n.FirstChild != nil {
				n.FirstChild.Data = rewriteCSS(n.FirstChild.Data, base)
			}
			if strings.EqualFold(n.Data, "form") {
				// The action is handled only here: resolving it twice would
				// wrap the gateway URL instead of the site's own target.
				method := "get"
				orig := ""
				for _, a := range n.Attr {
					switch strings.ToLower(a.Key) {
					case "method":
						method = strings.ToLower(strings.TrimSpace(a.Val))
					case "action":
						orig = a.Val
					}
				}
				ref, err := url.Parse(strings.TrimSpace(orig))
				if err != nil {
					ref = &url.URL{}
				}
				full := base.ResolveReference(ref)
				if (full.Scheme == "http" || full.Scheme == "https") && full.Host != "" {
					full.Fragment = ""
					if method == "get" || method == "" {
						// GET replaces the query string, so the target travels
						// in a hidden field.
						setAttr(n, "action", pageRoute)
						dropInputNamed(n, targetParam)
						n.AppendChild(hiddenInput(targetParam, enc(full.String())))
						if embed {
							n.AppendChild(hiddenInput("e", "1"))
						}
					} else {
						// POST keeps the body byte for byte; the target rides
						// in the action's query string.
						action := pageRoute + "?" + targetParam + "=" + enc(full.String())
						if embed {
							action += "&e=1"
						}
						setAttr(n, "action", action)
					}
				}
			}
			if strings.EqualFold(n.Data, "body") && notice != "" {
				banner := &html.Node{
					Type: html.ElementNode, Data: "div",
					Attr: []html.Attribute{{Key: "style", Val: "all:unset;display:block;position:relative;z-index:2147483646;" +
						"box-sizing:border-box;width:100%;padding:10px 14px;background:#FBE9E6;color:#8C2A20;" +
						"border-bottom:1px solid #F0C9C3;font:600 13px/1.4 system-ui,sans-serif"}},
					FirstChild: &html.Node{Type: html.TextNode, Data: notice},
				}
				n.InsertBefore(banner, n.FirstChild)
			}
			if strings.EqualFold(n.Data, "body") && notice != "" {
				banner := &html.Node{
					Type: html.ElementNode, Data: "div",
					Attr: []html.Attribute{{Key: "style", Val: "all:unset;display:block;position:relative;z-index:2147483646;" +
						"box-sizing:border-box;width:100%;padding:10px 14px;background:#FBE9E6;color:#8C2A20;" +
						"border-bottom:1px solid #F0C9C3;font:600 13px/1.4 system-ui,sans-serif"}},
					FirstChild: &html.Node{Type: html.TextNode, Data: notice},
				}
				n.InsertBefore(banner, n.FirstChild)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	// The bar is injected after the rewrite pass: it must keep its own
	// action="/go" and the current URL, not be rewritten like page content.
	if !embed {
		if body := findBody(doc); body != nil {
			if frag, err := html.ParseFragment(strings.NewReader(barHTML(base.String())), body); err == nil {
				for _, b := range frag {
					body.InsertBefore(b, body.FirstChild)
				}
			}
		}
	}

	var out bytes.Buffer
	if err := html.Render(&out, doc); err != nil {
		return body, err
	}
	return out.Bytes(), nil
}

// barHTML is the address bar injected into every proxied page.
func barHTML(current string) string {
	cur := htmlEscape(current)
	return `<div id="wv-bar">
<a href="/" title="Web Viewer home">&#8962;</a>
<button type="button" onclick="history.back()" title="Back">&#8592;</button>
<form action="/go" method="get" style="display:flex;flex:1;gap:6px;margin:0">
<input name="url" value="` + cur + `" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Address">
<button type="submit">Go</button>
</form>
</div>
<style>
#wv-bar{position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;gap:8px;
 padding:7px 10px;background:#0E1412;border-bottom:1px solid #222E29;box-shadow:0 2px 10px rgba(0,0,0,.28);
 font:13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif}
#wv-bar a,#wv-bar button{color:#E8EFEA;text-decoration:none}
#wv-bar>a{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;
 border-radius:7px;background:#151E1A;border:1px solid #2C3A33;font-size:15px}
#wv-bar form{display:flex;flex:1;gap:6px;margin:0}
#wv-bar input{flex:1;min-width:0;height:30px;padding:0 10px;border-radius:7px;border:1px solid #2C3A33;
 background:#151E1A;color:#E8EFEA;font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace}
#wv-bar input:focus{outline:none;border-color:#0E7A6E;box-shadow:0 0 0 3px rgba(14,122,110,.25)}
#wv-bar button{height:30px;padding:0 14px;border:0;border-radius:7px;background:#0E7A6E;color:#fff;
 font:600 12.5px/1 system-ui,sans-serif;cursor:pointer}
#wv-bar button[type=button]{width:30px;padding:0;background:#151E1A;border:1px solid #2C3A33}
body{padding-top:46px !important}
</style>`
}

var charsetRe = regexp.MustCompile(`(?i)charset=["']?([\w-]+)`)

func charsetOf(ct string) string {
	if m := charsetRe.FindStringSubmatch(ct); m != nil {
		return strings.ToLower(m[1])
	}
	return "utf-8"
}

func stripHeaders(h http.Header) {
	for _, k := range []string{
		"Content-Security-Policy", "Content-Security-Policy-Report-Only",
		"X-Frame-Options", "Strict-Transport-Security",
		"Content-Encoding", "Content-Length", "Transfer-Encoding",
		"Set-Cookie", "Clear-Site-Data", "Public-Key-Pins", "Expect-CT",
	} {
		h.Del(k)
	}
}

func copyHeader(dst, src http.Header) {
	for k, vv := range src {
		switch http.CanonicalHeaderKey(k) {
		case "Content-Security-Policy", "X-Frame-Options", "Strict-Transport-Security",
			"Content-Encoding", "Content-Length", "Transfer-Encoding", "Set-Cookie",
			"Clear-Site-Data", "Cache-Control", "Referrer-Policy":
			// Cache-Control/Referrer-Policy are set once by the gateway:
			// nothing is cached and the upstream URL never leaks.
			continue
		}
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}

// rewriteRefresh keeps a site's Refresh header inside the gateway: a relative
// URL in it would otherwise make the browser navigate to the router itself.
func rewriteRefresh(h http.Header, base *url.URL) {
	raw := h.Get("Refresh")
	if raw == "" || base == nil {
		return
	}
	delay, dest := "0", ""
	i := strings.IndexByte(raw, ';')
	if i < 0 {
		delay = strings.TrimSpace(raw)
	} else {
		delay = strings.TrimSpace(raw[:i])
		rest := strings.TrimSpace(raw[i+1:])
		if j := strings.IndexByte(rest, '='); j >= 0 {
			dest = strings.TrimSpace(rest[j+1:])
		}
	}
	dest = strings.Trim(dest, `"'`)
	if dest == "" {
		// A bare "Refresh: 30" just reloads the page; harmless and stays local.
		h.Set("Refresh", delay)
		return
	}
	ref, err := url.Parse(dest)
	if err != nil {
		h.Del("Refresh")
		return
	}
	abs := base.ResolveReference(ref)
	if abs.Scheme != "http" && abs.Scheme != "https" {
		h.Del("Refresh")
		return
	}
	h.Set("Refresh", delay+"; url="+pageRoute+"?"+targetParam+"="+enc(abs.String()))
}

func doFetch(s *session, r *http.Request, target string, doc bool) (*http.Response, *url.URL, error) {
	var body io.Reader
	if r.Method == http.MethodPost && r.Body != nil {
		body = r.Body
	}
	req, err := http.NewRequest(r.Method, target, body)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	if doc {
		// Look like a top-level navigation; several WAFs (eBay/Akamai) use these.
		req.Header.Set("Sec-Fetch-Dest", "document")
		req.Header.Set("Sec-Fetch-Mode", "navigate")
		req.Header.Set("Sec-Fetch-Site", "none")
		req.Header.Set("Sec-Fetch-User", "?1")
		req.Header.Set("Upgrade-Insecure-Requests", "1")
		// A click inside the viewer is an in-site navigation on the real web.
		// Send the originating page as Referer so bot protection (eBay/Akamai
		// answers 400/403 to bare listing requests) sees the same headers a
		// browser would send.
		if src := sourcePage(r); src != nil {
			ref := src.Scheme + "://" + src.Host + "/"
			site := "cross-site"
			if tu, err := url.Parse(target); err == nil && strings.EqualFold(tu.Host, src.Host) {
				ref = src.String()
				site = "same-origin"
			}
			req.Header.Set("Referer", ref)
			req.Header.Set("Sec-Fetch-Site", site)
		}
	} else {
		req.Header.Set("Sec-Fetch-Dest", "image")
		req.Header.Set("Sec-Fetch-Mode", "no-cors")
		req.Header.Set("Sec-Fetch-Site", "same-origin")
	}
	if r.Method == http.MethodPost {
		if ct := r.Header.Get("Content-Type"); ct != "" {
			req.Header.Set("Content-Type", ct)
		}
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	return resp, resp.Request.URL, nil
}

// fetchWithRetry repeats a GET once when the upstream answers 403/429.
// Bot protection (eBay/Akamai) sets its cookie on the rejection, so the
// second request with the session jar succeeds — exactly what a manual reload
// used to do.
func fetchWithRetry(s *session, r *http.Request, target string, doc bool) (*http.Response, *url.URL, error) {
	// Did this session already hold cookies for the host? A first, cookieless
	// hit to a bot-protected site (eBay/Akamai) often gets a challenge page
	// that *sets* the cookie; one retry then returns the real page.
	priorCookies := 0
	if u, err := url.Parse(target); err == nil {
		priorCookies = len(s.client.Jar.Cookies(u))
	}

	resp, final, err := doFetch(s, r, target, doc)
	if err != nil || resp == nil {
		return resp, final, err
	}

	retry := false
	if r.Method == http.MethodGet {
		afterCookies := priorCookies
		if u, err := url.Parse(target); err == nil {
			afterCookies = len(s.client.Jar.Cookies(u))
		}
		switch {
		case resp.StatusCode == http.StatusForbidden, resp.StatusCode == http.StatusTooManyRequests:
			retry = true
		case doc && priorCookies == 0 && resp.StatusCode < 400 && afterCookies > 0:
			// First cookieless hit that ended with cookies in the jar (they
			// can be set on an intermediate redirect) — bot challenges do this.
			retry = true
		}
	}
	if !retry {
		return resp, final, nil
	}
	io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
	resp.Body.Close()
	time.Sleep(120 * time.Millisecond)
	resp2, final2, err2 := doFetch(s, r, target, doc)
	if err2 != nil {
		return nil, nil, err2
	}
	return resp2, final2, nil
}

func handlePage(w http.ResponseWriter, r *http.Request) {
	target, err := targetFromRequest(r)
	if err != nil {
		renderError(w, err.Error(), "")
		return
	}
	if r.Method == http.MethodGet {
		q := r.URL.Query()
		extra := url.Values{}
		for k, vs := range q {
			if k == "u" || k == "url" || k == "e" || k == targetParam {
				continue
			}
			for _, v := range vs {
				extra.Add(k, v)
			}
		}
		if len(extra) > 0 {
			if u, err := url.Parse(target); err == nil {
				nq := u.Query()
				for k, vs := range extra {
					for _, v := range vs {
						nq.Add(k, v)
					}
				}
				u.RawQuery = nq.Encode()
				target = u.String()
			}
		}
	}
	s := getSession(w, r)
	resp, finalURL, err := fetchWithRetry(s, r, target, true)
	if err != nil {
		renderError(w, "The request failed", err.Error())
		return
	}
	defer resp.Body.Close()
	setSessionBase(s, finalURL)

	ct := resp.Header.Get("Content-Type")
	base, _ := url.Parse(finalURL.String())
	rewriteRefresh(resp.Header, base)

	switch {
	case strings.HasPrefix(ct, "text/html"), strings.HasPrefix(ct, "application/xhtml"):
		raw, err := io.ReadAll(io.LimitReader(resp.Body, maxHTML))
		if err != nil {
			renderError(w, "Could not read the page", err.Error())
			return
		}
		notice := ""
		if resp.StatusCode >= 400 {
			notice = fmt.Sprintf("The site answered HTTP %d (%s). This is the site's own response — it refused the router's address, not the viewer.", resp.StatusCode, http.StatusText(resp.StatusCode))
		}
		out, err := rewriteHTML(raw, base, notice, r.URL.Query().Get("e") == "1")
		if err != nil {
			out = raw
		}
		w.Header().Set("Content-Type", "text/html; charset="+charsetOf(ct))
		w.Header().Set("Cache-Control", "no-store")
		w.Write(out)
	case strings.HasPrefix(ct, "text/css"):
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxHTML))
		w.Header().Set("Content-Type", "text/css; charset="+charsetOf(resp.Header.Get("Content-Type")))
		w.Write([]byte(rewriteCSS(string(raw), base)))
	default:
		copyHeader(w.Header(), resp.Header)
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}
}

func handleAsset(w http.ResponseWriter, r *http.Request) {
	b := r.URL.Query().Get(targetParam)
	if b == "" {
		b = r.URL.Query().Get("u") // links written by older builds
	}
	target, err := dec(b)
	if err != nil {
		http.Error(w, "bad asset reference", http.StatusBadRequest)
		return
	}
	s := getSession(w, r)
	req, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		http.Error(w, "bad URL", http.StatusBadRequest)
		return
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Sec-Fetch-Dest", "image")
	req.Header.Set("Sec-Fetch-Mode", "no-cors")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	resp, err := s.client.Do(req)
	if err != nil {
		http.Error(w, "asset fetch failed", http.StatusBadGateway)
		return
	}
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		time.Sleep(120 * time.Millisecond)
		resp2, err2 := s.client.Do(req.Clone(r.Context()))
		if err2 == nil {
			resp = resp2
		}
	}
	defer resp.Body.Close()
	copyHeader(w.Header(), resp.Header)
	// A stylesheet has to go through the rewriter too.
	if strings.HasPrefix(resp.Header.Get("Content-Type"), "text/css") {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxHTML))
		base, _ := url.Parse(resp.Request.URL.String())
		w.Header().Set("Content-Type", "text/css; charset="+charsetOf(resp.Header.Get("Content-Type")))
		w.Write([]byte(rewriteCSS(string(raw), base)))
		return
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

const homeHTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Web Viewer</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
 background:#F4F5F1;color:#121916;font:400 15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.card{width:min(680px,calc(100vw - 32px));background:#fff;border:1px solid #E2E6DE;border-radius:16px;
 padding:28px 28px 22px;box-shadow:0 1px 2px rgba(14,20,18,.05),0 18px 40px -32px rgba(14,20,18,.35)}
h1{margin:0 0 4px;font-size:22px;letter-spacing:-.02em}
p.lede{margin:0 0 18px;color:#66736D;font-size:13.5px}
form{display:flex;gap:8px}
input[type=url]{flex:1;min-width:0;height:44px;padding:0 14px;border:1px solid #D7DDD3;border-radius:10px;
 font:400 14px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#121916;background:#fff}
input[type=url]:focus{outline:none;border-color:#0E7A6E;box-shadow:0 0 0 3px rgba(14,122,110,.14)}
button{height:44px;padding:0 20px;border:0;border-radius:10px;background:#0E7A6E;color:#fff;
 font:600 14px/1 system-ui,sans-serif;cursor:pointer}
button:hover{background:#0A5A52}
.meta{margin-top:14px;color:#66736D;font-size:12px}
.meta a{color:#0E7A6E}
.err{margin:0 0 14px;padding:12px 14px;border:1px solid #F0C9C3;background:#FBE9E6;border-radius:10px;
 color:#8C2A20;font-size:13px}
.err code{display:block;margin-top:6px;color:#6B3B35;font-size:11.5px;word-break:break-word}
</style></head><body>
<div class="card">
 <h1>Web Viewer</h1>
 <p class="lede">Pages are fetched by the router and served here, so the site sees the router's address — not this device's.</p>
 {{ERROR}}
 <form action="/go" method="get" autocomplete="off">
  <input type="text" name="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ebay.co.uk or https://example.com" autofocus required>
  <button type="submit">Open</button>
 </form>
 <div class="meta">HTML, CSS, images, forms and cookies are rewritten to stay inside the viewer.
  Sites that need client-side JavaScript apps will render partially or not at all.</div>
</div></body></html>`

func renderError(w http.ResponseWriter, msg, detail string) {
	block := ""
	if msg != "" {
		block = `<div class="err">` + htmlEscape(msg)
		if detail != "" {
			block += "<code>" + htmlEscape(detail) + "</code>"
		}
		block += "</div>"
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusBadGateway)
	w.Write([]byte(strings.Replace(homeHTML, "{{ERROR}}", block, 1)))
}

func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}

func handleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(strings.Replace(homeHTML, "{{ERROR}}", "", 1)))
}
