#!/bin/sh
# Cross-compiles the web gateway for the router (linux/arm64, static).
# Run on a build machine with Go:  ./build-webview.sh  ->  dist/webview-arm64
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/dist"
mkdir -p "$OUT"
cd "$HERE/webview"
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
	go build -trimpath -ldflags="-s -w" -o "$OUT/webview-arm64" .
ls -l "$OUT/webview-arm64"
