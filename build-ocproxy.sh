#!/bin/sh
# Cross-compiles the OpenCode client proxy for the router (linux/arm64, static).
#   ./build-ocproxy.sh  ->  dist/ocproxy-arm64
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/dist"
mkdir -p "$OUT"
cd "$HERE/ocproxy"
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
	go build -trimpath -ldflags="-s -w" -o "$OUT/ocproxy-arm64" .
ls -l "$OUT/ocproxy-arm64"
