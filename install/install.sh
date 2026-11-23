#!/bin/sh
# AW1000Ultra-OpenWRT installer — runs on the workstation.
#
#   ROUTER=root@192.168.0.1 ./install/install.sh
#   SSHPASS='…' ROUTER=root@192.168.0.1 ./install/install.sh
#
# Copies the payload to /tmp/aw1000-install on the router and runs
# install/install-remote.sh there. No credentials are stored in this repo.
set -eu

HERE=$(cd "$(dirname "$0")/.." && pwd)
ROUTER=${ROUTER:-root@192.168.0.1}
SSH_OPTS=${SSH_OPTS:-"-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"}

if [ -n "${SSHPASS:-}" ] && command -v sshpass >/dev/null 2>&1; then
	SSH="sshpass -e ssh $SSH_OPTS"
else
	SSH="ssh $SSH_OPTS"
fi

echo "== target: $ROUTER"
if ! $SSH "$ROUTER" 'echo ok' >/dev/null 2>&1; then
	echo "ERROR: cannot ssh to $ROUTER" >&2
	echo "       set ROUTER=user@host, and either use keys or SSHPASS=…" >&2
	exit 1
fi

echo "== uploading payload"
$SSH "$ROUTER" 'rm -rf /tmp/aw1000-install && mkdir -p /tmp/aw1000-install'
PAYLOAD="theme luci system portal data vendor-patches uci install"
[ -d "$HERE/dist" ] && PAYLOAD="$PAYLOAD dist"
tar -C "$HERE" -cf - $PAYLOAD \
	| $SSH "$ROUTER" 'tar -xf - -C /tmp/aw1000-install'

echo "== running remote installer"
ENVS=""
for v in WITH_THEME WITH_PARENTAL WITH_LOGS WITH_WEBVIEW WITH_OPENCODE WITH_FILESHARES WITH_WANFAILOVER WITH_VPNSPLIT WITH_LEDS \
         WITH_CAPTIVEPORTAL WITH_CLOUDFLARE WITH_SIEM WITH_VENDOR_PATCHES \
         WITH_BOOTSTRAP_PATCHES ACTIVATE_THEME; do
	eval "val=\${$v:-}"
	[ -n "$val" ] && ENVS="$ENVS $v=$val"
done

$SSH "$ROUTER" "$ENVS sh /tmp/aw1000-install/install/install-remote.sh"

echo
echo "== done"
echo "   backup of /etc/config: see /root/aw1000-backup-*/ on the router"
echo "   theme rollback:        uci set luci.main.mediaurlbase='/luci-static/bootstrap'"
