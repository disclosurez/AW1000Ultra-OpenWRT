package main

import (
	"bytes"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func findTag(t *testing.T, body []byte, tag string) *html.Node {
	t.Helper()
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	var found *html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if found != nil {
			return
		}
		if n.Type == html.ElementNode && strings.EqualFold(n.Data, tag) {
			found = n
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	if found == nil {
		t.Fatalf("no <%s> in output", tag)
	}
	return found
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if strings.EqualFold(a.Key, key) {
			return a.Val
		}
	}
	return ""
}

func decodeU(t *testing.T, v string) string {
	t.Helper()
	s, err := dec(v)
	if err != nil {
		t.Fatalf("u=%q is not base64url: %v", v, err)
	}
	return s
}

func TestFormGetTargetIsResolvedOnce(t *testing.T) {
	base, _ := url.Parse("https://www.ebay.co.uk/")
	out, err := rewriteHTML([]byte(`<html><body><form action="/sch/i.html" method="get"><input name="_nkw"></form></body></html>`), base, "", true)
	if err != nil {
		t.Fatal(err)
	}
	f := findTag(t, out, "form")
	if got := attr(f, "action"); got != pageRoute {
		t.Errorf("action = %q, want %q", got, pageRoute)
	}
	var u string
	for c := f.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && strings.EqualFold(c.Data, "input") && attr(c, "name") == targetParam {
			u = attr(c, "value")
		}
	}
	if want := "https://www.ebay.co.uk/sch/i.html"; decodeU(t, u) != want {
		t.Errorf("hidden u = %q, want %q", decodeU(t, u), want)
	}
}

func TestFormPostTargetRidesInActionQuery(t *testing.T) {
	base, _ := url.Parse("https://example.com/login")
	out, err := rewriteHTML([]byte(`<html><body><form action="?next=/inbox" method="post"><input name="user"></form></body></html>`), base, "", true)
	if err != nil {
		t.Fatal(err)
	}
	f := findTag(t, out, "form")
	action := attr(f, "action")
	u, err := url.Parse(action)
	if err != nil {
		t.Fatal(err)
	}
	if u.Path != pageRoute {
		t.Errorf("action path = %q, want %q", u.Path, pageRoute)
	}
	if want := "https://example.com/login?next=/inbox"; decodeU(t, u.Query().Get(targetParam)) != want {
		t.Errorf("action u = %q, want %q", decodeU(t, u.Query().Get(targetParam)), want)
	}
	for c := f.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && strings.EqualFold(c.Data, "input") && attr(c, "name") == targetParam {
			t.Error("POST form must not carry a hidden u field (it would be sent in the body)")
		}
	}
}

func TestFormKeepsSiteFieldNamedU(t *testing.T) {
	base, _ := url.Parse("https://example.com/")
	out, err := rewriteHTML([]byte(`<html><body><form action="/find" method="get"><input name="u" value="alice"></form></body></html>`), base, "", true)
	if err != nil {
		t.Fatal(err)
	}
	f := findTag(t, out, "form")
	var siteU, ours bool
	for c := f.FirstChild; c != nil; c = c.NextSibling {
		if c.Type != html.ElementNode || !strings.EqualFold(c.Data, "input") {
			continue
		}
		switch attr(c, "name") {
		case "u":
			siteU = attr(c, "value") == "alice"
		case targetParam:
			ours = decodeU(t, attr(c, "value")) == "https://example.com/find"
		}
	}
	if !siteU {
		t.Error("site field named u was lost or changed")
	}
	if !ours {
		t.Error("target field wv_u missing or wrong")
	}
}

func TestFormWithNoActionTargetsCurrentPage(t *testing.T) {
	base, _ := url.Parse("https://example.com/search?q=cats")
	out, err := rewriteHTML([]byte(`<html><body><form><input name="q"></form></body></html>`), base, "", true)
	if err != nil {
		t.Fatal(err)
	}
	f := findTag(t, out, "form")
	var u string
	for c := f.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && attr(c, "name") == targetParam {
			u = attr(c, "value")
		}
	}
	if want := "https://example.com/search?q=cats"; decodeU(t, u) != want {
		t.Errorf("hidden u = %q, want %q", decodeU(t, u), want)
	}
}

func TestSourcePageDecodesReferer(t *testing.T) {
	r, _ := http.NewRequest("GET", "http://router:8090/search/cats?top&id=1", nil)
	r.Header.Set("Referer", "http://router:8090/go?u="+enc("https://site.example/page/1")+"&e=1")
	got := sourcePage(r)
	if got == nil || got.String() != "https://site.example/page/1" {
		t.Fatalf("sourcePage = %v, want https://site.example/page/1", got)
	}
}

func TestRewriteRefresh(t *testing.T) {
	base, _ := url.Parse("https://site.example/a/b")
	h := http.Header{}
	h.Set("Refresh", "0; url=/next?x=1")
	rewriteRefresh(h, base)
	got := h.Get("Refresh")
	if !strings.HasPrefix(got, "0; url="+pageRoute+"?"+targetParam+"=") {
		t.Fatalf("Refresh = %q", got)
	}
	u, _ := url.Parse(strings.TrimPrefix(got, "0; url="))
	if want := "https://site.example/next?x=1"; decodeU(t, u.Query().Get(targetParam)) != want {
		t.Errorf("Refresh u = %q, want %q", decodeU(t, u.Query().Get(targetParam)), want)
	}
}
