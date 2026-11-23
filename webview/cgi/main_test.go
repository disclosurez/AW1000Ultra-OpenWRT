package main

import "testing"

func TestPortFrom(t *testing.T) {
	cases := []struct {
		cfg  string
		want string
	}{
		{"config settings 'settings'\n\toption enabled '1'\n\toption port '8090'\n", "8090"},
		{"option port 9123\n", "9123"},
		{"# option port '1'\noption port '8443' # live\n", "8443"},
		{"config settings 'settings'\n\toption enabled '1'\n", "8090"},
	}
	for _, c := range cases {
		if got := portFrom([]byte(c.cfg)); got != c.want {
			t.Errorf("portFrom(%q) = %q, want %q", c.cfg, got, c.want)
		}
	}
}

func TestRewrite(t *testing.T) {
	cases := []struct{ in, want string }{
		{`<a href="/">home</a>`, `<a href="/cgi-bin/webview/">home</a>`},
		{`<form action="/go" method="get">`, `<form action="/cgi-bin/webview/go" method="get">`},
		{`<img src="/raw?u=abc">`, `<img src="/cgi-bin/webview/raw?u=abc">`},
		{`<img srcset="/raw?u=a 1x, /raw?u=b 2x">`, `<img srcset="/cgi-bin/webview/raw?u=a 1x, /cgi-bin/webview/raw?u=b 2x">`},
		{`<style>x{background:url(/raw?u=c)}</style>`, `<style>x{background:url(/cgi-bin/webview/raw?u=c)}</style>`},
		{`@import "/raw?u=d";`, `@import "/cgi-bin/webview/raw?u=d";`},
		{`<a href="https://upstream.example/x">`, `<a href="https://upstream.example/x">`},
		{`<a href="//cdn.example/x">`, `<a href="//cdn.example/x">`},
	}
	for _, c := range cases {
		if got := string(rewrite([]byte(c.in))); got != c.want {
			t.Errorf("rewrite(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestLocation(t *testing.T) {
	cases := []struct{ in, want string }{
		{"/go?u=x", "/cgi-bin/webview/go?u=x"},
		{"/cgi-bin/webview/go", "/cgi-bin/webview/go"},
		{"//cdn.example/x", "//cdn.example/x"},
		{"https://example.com/", "https://example.com/"},
	}
	for _, c := range cases {
		if got := location(c.in); got != c.want {
			t.Errorf("location(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
