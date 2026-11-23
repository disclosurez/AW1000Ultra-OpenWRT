// ocproxy — router-side client for an OpenCode server.
//
// OpenCode's web UI is password-protected and normally opened through a
// one-time pairing link (/auth/connect/<code>) that sets a session cookie.
// This service does that pairing once, then reverse-proxies the server on the
// LAN so the UI can be embedded in LuCI (frame headers stripped, redirects and
// cookies rewritten, WebSocket upgrades forwarded).
//
// Config (JSON, written by the init script):
//
//	{"listen":"192.168.0.1:8091","upstream":"https://xxxx.opentunnel.xyz",
//	 "password":"secret","pair_url":"","insecure":false}
//
// Upstream may be a plain URL (paired with the password) or a one-time pairing
// link in "pair_url" (the link wins; the password becomes optional).
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

type config struct {
	Listen   string `json:"listen"`
	Upstream string `json:"upstream"`
	Password string `json:"password"`
	PairURL  string `json:"pair_url"`
	Insecure bool   `json:"insecure"`
}

type proxy struct {
	cfg      config
	target   *url.URL
	rp       *httputil.ReverseProxy
	client   *http.Client
	mu       sync.RWMutex
	cookie   string
	pairedAt time.Time
	lastErr  string
}

func main() {
	path := flag.String("config", "/tmp/ocproxy/config.json", "config file")
	flag.Parse()

	raw, err := os.ReadFile(*path)
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	var cfg config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		log.Fatalf("config parse: %v", err)
	}
	if cfg.Upstream == "" {
		log.Fatal("config: upstream is required")
	}
	up, err := url.Parse(strings.TrimRight(cfg.Upstream, "/"))
	if err != nil || up.Host == "" {
		log.Fatalf("config: bad upstream: %v", err)
	}

	p := &proxy{cfg: cfg, target: up}
	tr := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          32,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
	}
	if cfg.Insecure {
		tr.TLSClientConfig = insecureTLS()
	}
	p.client = &http.Client{
		Transport: &retryTransport{p: p, base: tr},
		Timeout:   30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	p.rp = &httputil.ReverseProxy{
		Director:       p.director,
		ModifyResponse: p.modify,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("upstream error %s %s: %v", r.Method, r.URL.Path, err)
			p.mu.Lock()
			p.lastErr = err.Error()
			p.cookie = "" // let the watcher re-pair as soon as the server is back
			p.mu.Unlock()
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusBadGateway)
			fmt.Fprintf(w, upstreamErrorPage, htmlEscape(p.target.String()), htmlEscape(err.Error()))
		},
		FlushInterval: -1, // stream SSE/websocket frames as they arrive
	}

	if err := p.pair(context.Background()); err != nil {
		log.Printf("pairing failed (will retry on demand): %v", err)
	} else {
		log.Printf("paired with %s", up)
	}
	go p.watch()

	mux := http.NewServeMux()
	mux.HandleFunc("/__status", p.handleStatus)
	mux.HandleFunc("/__pair", p.handlePair)
	mux.Handle("/", p.rp)

	// Access log: enough to tell "the browser never arrived" apart from
	// "the proxy answered with an error". Only the paths that matter.
	logged := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || strings.HasPrefix(r.URL.Path, "/api/") {
			sw := &statusWriter{ResponseWriter: w, status: 200}
			start := time.Now()
			mux.ServeHTTP(sw, r)
			log.Printf("%s %s %s -> %d (%s)", r.RemoteAddr, r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
			return
		}
		mux.ServeHTTP(w, r)
	})

	srv := &http.Server{Addr: cfg.Listen, Handler: logged, ReadHeaderTimeout: 10 * time.Second}
	log.Printf("ocproxy listening on %s -> %s", cfg.Listen, up)
	log.Fatal(srv.ListenAndServe())
}

const upstreamErrorPage = `<!doctype html><html><head><meta charset="utf-8">
<title>OpenCode server unreachable</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f5f1;
color:#121916;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.card{width:min(620px,calc(100vw - 32px));background:#fff;border:1px solid #e2e6de;border-radius:14px;padding:24px}
h1{margin:0 0 6px;font-size:20px}p{margin:0 0 10px;color:#3d4944}code{font:12px ui-monospace,monospace;background:#f7f8f3;
padding:2px 5px;border-radius:4px}small{color:#66736d}</style></head><body><div class="card">
<h1>The OpenCode server is not answering</h1>
<p>The router paired with it, but the last request failed.</p>
<p>Server: <code>%s</code></p>
<p><small>%s</small></p>
<p><small>Check that the server is still running and that this router can reach it
(for OpenTunnel, that the tunnel is connected). This page retries by itself.</small></p>
<p><small>Retrying…</small></p>
<script>setTimeout(function(){location.reload()},5000)</script>
</div></body></html>`

// retryTransport re-pairs once when the server answers 401 (session cookie
// invalidated by a server restart or a password change).
type retryTransport struct {
	p    *proxy
	base http.RoundTripper
}

func (t *retryTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusUnauthorized {
		return resp, err
	}
	if req.Method != http.MethodGet && req.Method != http.MethodHead {
		// Do not replay bodies; just refresh the session for later requests.
		_ = t.p.pair(req.Context())
		return resp, nil
	}
	if perr := t.p.pair(req.Context()); perr != nil {
		return resp, nil
	}
	resp.Body.Close()
	req2 := req.Clone(req.Context())
	req2.Header.Set("Cookie", t.p.cookieValue())
	return t.base.RoundTrip(req2)
}

type origHostKey struct{}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// Hijack keeps WebSocket upgrades working through the wrapper.
func (w *statusWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("hijack unsupported")
	}
	return h.Hijack()
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (p *proxy) director(req *http.Request) {
	*req = *req.WithContext(context.WithValue(req.Context(), origHostKey{}, req.Host))
	req.URL.Scheme = p.target.Scheme
	req.URL.Host = p.target.Host
	req.Host = p.target.Host
	if c := p.cookieValue(); c != "" {
		req.Header.Set("Cookie", c)
	}
	// A pairing session is bound to the upstream host.
	req.Header.Del("Origin")
}

func (p *proxy) modify(resp *http.Response) error {
	// The server advertises its own addresses in /api/info (127.0.0.1 and the
	// host IP). A browser using the proxy cannot reach those, and the app
	// treats them as the server → "can't reach this server". Point them at
	// the origin the client actually used.
	if resp.Request != nil && strings.HasSuffix(resp.Request.URL.Path, "/api/info") {
		if body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)); err == nil {
			resp.Body.Close()
			host, _ := resp.Request.Context().Value(origHostKey{}).(string)
			if host != "" {
				var doc map[string]any
				if json.Unmarshal(body, &doc) == nil {
					doc["urls"] = []string{"http://" + host}
					if out, err := json.Marshal(doc); err == nil {
						body = out
					}
				}
			}
			resp.Body = io.NopCloser(bytes.NewReader(body))
			resp.ContentLength = int64(len(body))
			resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(body)))
		}
	}
	h := resp.Header
	h.Del("X-Frame-Options")
	h.Del("Content-Security-Policy")
	h.Del("Content-Security-Policy-Report-Only")
	h.Del("Cross-Origin-Opener-Policy")
	h.Del("Cross-Origin-Embedder-Policy")
	h.Del("Cross-Origin-Resource-Policy")

	if loc := h.Get("Location"); loc != "" {
		if u, err := url.Parse(loc); err == nil && u.Host == p.target.Host {
			if u.Scheme == "" || u.Scheme == p.target.Scheme {
				h.Set("Location", u.RequestURI())
			}
		}
	}
	if scs, ok := h["Set-Cookie"]; ok {
		out := make([]string, 0, len(scs))
		for _, sc := range scs {
			out = append(out, rewriteCookie(sc))
		}
		h["Set-Cookie"] = out
	}
	return nil
}

func rewriteCookie(sc string) string {
	parts := strings.Split(sc, ";")
	if len(parts) == 0 {
		return sc
	}
	keep := []string{strings.TrimSpace(parts[0])}
	for _, a := range parts[1:] {
		kv := strings.TrimSpace(a)
		low := strings.ToLower(kv)
		if strings.HasPrefix(low, "domain=") {
			continue
		}
		if strings.HasPrefix(low, "secure") {
			continue // our side is plain HTTP on the LAN
		}
		keep = append(keep, kv)
	}
	return strings.Join(keep, "; ")
}

func (p *proxy) cookieValue() string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.cookie
}

// watch keeps the pairing alive: when the server restarts (or a tunnel drops
// and returns), the stored cookie is stale and the UI would stay empty until
// someone pressed Pair now. This retries every 15 s while the last attempt
// failed, and every 10 min otherwise.
func (p *proxy) watch() {
	for {
		p.mu.RLock()
		paired := p.cookie != ""
		last := p.pairedAt
		p.mu.RUnlock()

		// A live session is refreshed every ten minutes; a broken one is
		// retried every fifteen seconds until the server (or tunnel) is back.
		if paired && time.Since(last) < 10*time.Minute {
			time.Sleep(5 * time.Second)
			continue
		}
		if !paired {
			time.Sleep(15 * time.Second)
		}
		if err := p.pair(context.Background()); err != nil {
			p.mu.Lock()
			p.cookie = ""
			p.lastErr = err.Error()
			p.mu.Unlock()
			log.Printf("re-pair failed: %v", err)
			continue
		}
		log.Printf("re-paired with %s", p.target)
	}
}

func (p *proxy) handleStatus(w http.ResponseWriter, _ *http.Request) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	age := 0
	if !p.pairedAt.IsZero() {
		age = int(time.Since(p.pairedAt).Seconds())
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	// The LuCI page probes this from another port to tell "proxy down" apart
	// from "browser cannot reach 8091".
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]any{
		"paired":     p.cookie != "",
		"upstream":   p.target.String(),
		"cookie_age": age,
		"error":      p.lastErr,
		"listen":     p.cfg.Listen,
	})
}

func (p *proxy) handlePair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	err := p.pair(r.Context())
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

// pair redeems either the configured pairing link or a fresh code created with
// the server password.
func (p *proxy) pair(ctx context.Context) error {
	var cookie string
	var err error

	if p.cfg.PairURL != "" {
		cookie, err = p.pairByLink(ctx, p.cfg.PairURL)
	} else if p.cfg.Password != "" {
		var link string
		link, err = p.createLink(ctx)
		if err == nil {
			cookie, err = p.pairByLink(ctx, link)
		}
	} else {
		err = errors.New("no password and no pairing link configured")
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	if err != nil {
		p.lastErr = err.Error()
		return err
	}
	p.cookie = cookie
	p.pairedAt = time.Now()
	p.lastErr = ""
	return nil
}

func (p *proxy) createLink(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.target.String()+"/api/pair", nil)
	if err != nil {
		return "", err
	}
	req.SetBasicAuth("opencode", p.cfg.Password)
	req.Header.Set("Accept", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("pair: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var out struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(body, &out); err != nil || out.Code == "" {
		return "", fmt.Errorf("pair: unexpected response %q", strings.TrimSpace(string(body)))
	}
	return p.target.String() + "/auth/connect/" + url.PathEscape(out.Code), nil
}

func (p *proxy) pairByLink(ctx context.Context, link string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "text/html")
	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	// The browser path answers 302 + Set-Cookie; a JSON client gets a token.
	for _, c := range resp.Cookies() {
		if strings.HasPrefix(c.Name, "opencode_session") {
			return c.Name + "=" + c.Value, nil
		}
	}
	if resp.StatusCode == http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
		var tok struct {
			Token string `json:"token"`
		}
		if json.Unmarshal(body, &tok) == nil && tok.Token != "" {
			return tokenCookie(req, tok.Token), nil
		}
	}
	return "", fmt.Errorf("pairing link returned HTTP %d without a session", resp.StatusCode)
}

// tokenCookie names the session cookie the way the server would. The port is
// part of the upstream cookie name, so fall back to the generic name.
func tokenCookie(req *http.Request, token string) string {
	name := "opencode_session"
	if u, err := url.Parse(req.URL.String()); err == nil {
		if port := u.Port(); port != "" {
			name += "_" + port
		}
	}
	return name + "=" + token
}
