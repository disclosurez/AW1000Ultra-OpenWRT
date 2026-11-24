// ocgate — TLS front door on :443 for LuCI plus the OpenCode web app.
//
// The console is served by uhttpd on :80. This process terminates TLS with the
// router's existing certificate (the one the browser already accepted) and
// routes by path:
//
//	/api/*, /_assets/*  -> ocproxy    (OpenCode API, assets, SSE, WebSocket)
//	/oc/*               -> ocproxy    (OpenCode web app, prefix stripped)
//	everything else     -> uhttpd :80 (LuCI, static files, ubus)
//
// A request that carries the oc_gate cookie (set when the app was opened under
// /oc/) is routed to ocproxy even for SPA deep links like /session/ses_…,
// while LuCI requests (no cookie) are unaffected.
package main

import (
	"crypto/tls"
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

type gate struct {
	luci http.Handler
	app  http.Handler
}

func main() {
	listen := flag.String("listen", "0.0.0.0:443", "TLS listen address")
	cert := flag.String("cert", "/etc/uhttpd.crt", "certificate")
	key := flag.String("key", "/etc/uhttpd.key", "private key")
	ocproxy := flag.String("ocproxy", "http://127.0.0.1:8091", "OpenCode proxy")
	uhttpd := flag.String("uhttpd", "http://127.0.0.1:80", "LuCI")
	prefix := flag.String("prefix", "/oc/", "app path prefix")
	flag.Parse()

	g := &gate{
		luci: reverseProxy(*uhttpd, ""),
		app:  reverseProxy(*ocproxy, *prefix),
	}

	srv := &http.Server{
		Addr:              *listen,
		Handler:           g,
		ReadHeaderTimeout: 15 * time.Second,
		TLSConfig:         &tls.Config{MinVersion: tls.VersionTLS12},
	}
	log.Printf("ocgate %s -> luci %s, app %s under %s", *listen, *uhttpd, *ocproxy, *prefix)
	log.Fatal(srv.ListenAndServeTLS(*cert, *key))
}

func reverseProxy(target, strip string) http.Handler {
	u, err := url.Parse(target)
	if err != nil {
		log.Fatalf("bad upstream %s: %v", target, err)
	}
	rp := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			host := req.Host
			req.URL.Scheme = u.Scheme
			req.URL.Host = u.Host
			req.Host = host
			if strip != "" && strings.HasPrefix(req.URL.Path, strip) {
				rest := strings.TrimPrefix(req.URL.Path, strip)
				req.URL.Path = "/" + rest
				req.URL.RawPath = ""
			}
		},
		ModifyResponse: func(resp *http.Response) error {
			resp.Header.Del("X-Frame-Options")
			resp.Header.Del("Content-Security-Policy")
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			// No request path here: the viewer's browsing must not be recorded.
			log.Printf("upstream %s failed: %v", r.Method, err)
			http.Error(w, "gate: "+err.Error(), http.StatusBadGateway)
		},
		FlushInterval: -1,
	}
	return rp
}

// appPaths are the SPA's own root-relative paths; none of them collide with
// LuCI (/cgi-bin, /luci-static).
var appPaths = []string{"/api/", "/assets/", "/_assets/", "/session", "/server", "/settings", "/help", "/new", "/project", "/sw.js", "/manifest.webmanifest"}

// viewerReferer reports whether the request came from a web-viewer page
// (direct :8090 frames use the bridge only over HTTPS, but the viewer's own
// links always carry /cgi-bin/webview in their Referer).
func viewerReferer(r *http.Request) bool {
	ref := r.Header.Get("Referer")
	return strings.Contains(ref, "/cgi-bin/webview/") || strings.HasSuffix(ref, "/cgi-bin/webview")
}

func isAppPath(p string) bool {
	for _, pre := range appPaths {
		if strings.HasPrefix(p, pre) {
			return true
		}
	}
	return false
}

// gateCookiePaths scopes the marker cookie so LuCI never sends it.
var gateCookiePaths = []string{"/api", "/assets", "/_assets", "/session", "/server", "/settings", "/help", "/new", "/project"}

func (g *gate) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Path

	// Opening "/?oc=1" boots the app at the origin root (its router expects
	// to live there) and marks the app paths for the rest of the session.
	if r.URL.Query().Get("oc") == "1" {
		for _, cp := range gateCookiePaths {
			http.SetCookie(w, &http.Cookie{
				Name: "oc_gate", Value: "1", Path: cp, HttpOnly: true, SameSite: http.SameSiteLaxMode,
			})
		}
		g.app.ServeHTTP(w, r)
		return
	}

	// A root-relative navigation out of a web-viewer page belongs to the
	// proxied site, not to LuCI. The viewer rewrites its links, but URLs built
	// by client-side JavaScript cannot be rewritten; route those back through
	// the bridge so the viewer can resolve them instead of uhttpd answering
	// 404/400.
	if viewerReferer(r) && !strings.HasPrefix(p, "/cgi-bin/") {
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/cgi-bin/webview" + p
		r2.URL.RawPath = ""
		g.luci.ServeHTTP(w, r2)
		return
	}

	if isAppPath(p) {
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/assets/") ||
			strings.HasPrefix(p, "/_assets/") || p == "/sw.js" || p == "/manifest.webmanifest" {
			g.app.ServeHTTP(w, r)
			return
		}
		if c, err := r.Cookie("oc_gate"); err == nil && c.Value == "1" {
			g.app.ServeHTTP(w, r)
			return
		}
	}
	g.luci.ServeHTTP(w, r)
}
