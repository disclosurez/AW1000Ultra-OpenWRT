#!/bin/sh
# Cross-compiles the same-origin CGI bridge for the router (linux/arm64).
# Run on a build machine with Go:  ./build-wvcgi.sh  ->  dist/wvcgi-arm64
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/dist"
mkdir -p "$OUT"
cd "$HERE/webview"
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
	go build -trimpath -ldflags="-s -w" -o "$OUT/wvcgi-arm64" ./cgi
ls -l "$OUT/wvcgi-arm64"
