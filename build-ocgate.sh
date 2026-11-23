#!/bin/sh
# Cross-compiles the HTTPS front door (LuCI + OpenCode app on :443).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$HERE/dist"
cd "$HERE/ocgate"
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o "$HERE/dist/ocgate-arm64" .
ls -l "$HERE/dist/ocgate-arm64"
