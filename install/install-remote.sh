#!/bin/sh
# AW1000Ultra-OpenWRT installer — runs ON the router.
# Called by install/install.sh; safe to re-run.
#
# Environment switches (default 1, except WITH_BOOTSTRAP_PATCHES):
#   WITH_THEME WITH_PARENTAL WITH_LOGS WITH_WANFAILOVER WITH_VPNSPLIT
#   WITH_CAPTIVEPORTAL WITH_CLOUDFLARE WITH_SIEM WITH_VENDOR_PATCHES
#   ACTIVATE_THEME
set -eu

SRC=/tmp/aw1000-install
STAMP=$(date +%s)
BK=/root/aw1000-backup-$STAMP

log() { echo "== $*"; }

put() { # put <src> <dst> <mode>
	[ -f "$1" ] || { echo "   skip (missing): $1"; return 0; }
	mkdir -p "$(dirname "$2")"
	cp -f "$1" "$2"
	chmod "$3" "$2"
}

ensure_include() { # ensure_include <path>
	uci show firewall 2>/dev/null | grep -q "path='$1'" && return 0
	sec=$(uci add firewall include)
	uci set "firewall.$sec.type=script"
	uci set "firewall.$sec.path=$1"
	uci set "firewall.$sec.reload=1"
	uci commit firewall
	log "registered fw3 include $1 as $sec"
}

cron_add() { # cron_add '<line>'
	grep -qF "$1" /etc/crontabs/root 2>/dev/null || echo "$1" >> /etc/crontabs/root
}

seed() { # seed <uci-name> <file>
	[ -f "/etc/config/$1" ] && return 0
	put "$2" "/etc/config/$1" 0644
	log "seeded /etc/config/$1"
}

# ---------------------------------------------------------------- backup
log "backup -> $BK"
mkdir -p "$BK"
for f in network firewall dhcp luci parental vpnsplit wanfailover cloudflare captiveportal siem system leds wifi_guest; do
	[ -f "/etc/config/$f" ] && cp -f "/etc/config/$f" "$BK/" || true
done

# ---------------------------------------------------------------- always
log "helper commands"
put "$SRC/system/sbin/parental-control"    /usr/sbin/parental-control    0755
put "$SRC/system/sbin/parental-acct"       /usr/sbin/parental-acct       0755
put "$SRC/system/sbin/parental-domains"    /usr/sbin/parental-domains    0755
put "$SRC/system/sbin/lan-scan"            /usr/sbin/lan-scan            0755
put "$SRC/system/sbin/port-scan"           /usr/sbin/port-scan           0755
put "$SRC/system/sbin/port-scan-all"       /usr/sbin/port-scan-all       0755
put "$SRC/system/sbin/wan-failover"        /usr/sbin/wan-failover        0755
put "$SRC/system/sbin/wan-notify"           /usr/sbin/wan-notify          0755
put "$SRC/system/sbin/vpnplit-route"       /usr/sbin/vpnplit-route       0755
put "$SRC/system/sbin/vpnsplit-warm"        /usr/sbin/vpnsplit-warm        0755
put "$SRC/system/sbin/captiveportal-ctl"   /usr/sbin/captiveportal       0755
put "$SRC/system/sbin/dnscat-update"       /usr/sbin/dnscat-update       0755
put "$SRC/system/sbin/dnslog-clear"        /usr/sbin/dnslog-clear        0755
put "$SRC/system/sbin/dnslog-rotate"       /usr/sbin/dnslog-rotate       0755
put "$SRC/system/sbin/dnslog-report"       /usr/sbin/dnslog-report       0755
put "$SRC/system/sbin/oui-update"          /usr/sbin/oui-update          0755

log "data directories"
mkdir -p /data/logs /data/dnscat /data/oui /data/portal /data/cloudflare/bin

# ---------------------------------------------------------------- theme
if [ "${WITH_THEME:-1}" = 1 ]; then
	log "console theme"
	mkdir -p /www/luci-static/console/fonts /usr/lib/lua/luci/view/themes/console
	put "$SRC/theme/cascade.css"   /www/luci-static/console/cascade.css   0644
	put "$SRC/theme/console.js"    /www/luci-static/console/console.js    0644
	put "$SRC/theme/favicon.svg"   /www/luci-static/console/favicon.svg   0644
	for f in "$SRC"/theme/fonts/*.woff2; do
		[ -f "$f" ] || continue
		put "$f" "/www/luci-static/console/fonts/$(basename "$f")" 0644
	done
	put "$SRC/theme/header.htm"  /usr/lib/lua/luci/view/themes/console/header.htm  0644
	put "$SRC/theme/footer.htm"  /usr/lib/lua/luci/view/themes/console/footer.htm  0644
	put "$SRC/theme/sysauth.htm" /usr/lib/lua/luci/view/themes/console/sysauth.htm 0644
	put "$SRC/theme/menu-console.js" /www/luci-static/resources/menu-console3.js   0644
	put "$SRC/luci/controller/console.lua" /usr/lib/lua/luci/controller/console.lua 0644

	# Theme switcher: System -> Theme, reachable in both themes.
	mkdir -p /usr/lib/lua/luci/view/theme
	put "$SRC/luci/controller/theme.lua" /usr/lib/lua/luci/controller/theme.lua 0644
	put "$SRC/luci/view/theme/switch.htm" /usr/lib/lua/luci/view/theme/switch.htm 0644
	uci set luci.themes.Console='/luci-static/console'
	uci set luci.themes.Bootstrap='/luci-static/bootstrap'
	uci commit luci

	if [ "${ACTIVATE_THEME:-1}" = 1 ]; then
		uci set luci.main.mediaurlbase='/luci-static/console'
		uci commit luci
		log "theme activated (flip: System → Theme, or uci set luci.main.mediaurlbase='/luci-static/bootstrap')"
	fi
fi

# ---------------------------------------------------------------- leds
if [ "${WITH_LEDS:-1}" = 1 ]; then
	log "led controller"
	put "$SRC/system/sbin/aw1000-led"   /usr/sbin/aw1000-led   0755
	put "$SRC/system/init.d/aw1000led"  /etc/init.d/aw1000led  0755
	put "$SRC/luci/controller/leds.lua" /usr/lib/lua/luci/controller/leds.lua 0644
	mkdir -p /usr/lib/lua/luci/view/leds
	put "$SRC/luci/view/leds/overview.htm" /usr/lib/lua/luci/view/leds/overview.htm 0644
	seed leds "$SRC/uci/leds"
	# Point the stock System -> LED Configuration menu entry at our page: the
	# stock one edits netdev triggers this kernel does not provide, and the
	# vendor led_ctrld rewrote them anyway. Backup kept as .orig.
	if [ -f /usr/share/luci/menu.d/luci-mod-system.json ] && \
	   ! grep -q '"path": "leds/overview"' /usr/share/luci/menu.d/luci-mod-system.json; then
		[ -f /usr/share/luci/menu.d/luci-mod-system.json.orig ] || \
			cp -f /usr/share/luci/menu.d/luci-mod-system.json /usr/share/luci/menu.d/luci-mod-system.json.orig
		sed -i -e '/"admin\/system\/leds"/,/^\t\t}/ s/"type": "view"/"type": "template"/' \
			-e 's|"path": "system/leds"|"path": "leds/overview"|' \
			/usr/share/luci/menu.d/luci-mod-system.json
		log "patched System -> LED Configuration menu entry"
	fi
	/etc/init.d/aw1000led enable
	/etc/init.d/aw1000led restart
fi

# ---------------------------------------------------------------- opencode
if [ "${WITH_OPENCODE:-1}" = 1 ]; then
	log "opencode client proxy"
	mkdir -p /usr/lib/lua/luci/view/opencode /data/ocproxy/bin
	put "$SRC/system/init.d/ocproxy"            /etc/init.d/ocproxy            0755
	put "$SRC/luci/controller/opencode.lua"     /usr/lib/lua/luci/controller/opencode.lua 0644
	put "$SRC/luci/view/opencode/overview.htm"  /usr/lib/lua/luci/view/opencode/overview.htm 0644
	seed opencode "$SRC/uci/opencode"
	chmod 600 /etc/config/opencode
	if [ -f "$SRC/dist/ocproxy-arm64" ]; then
		put "$SRC/dist/ocproxy-arm64" /data/ocproxy/bin/ocproxy 0755
	fi
	[ -x /data/ocproxy/bin/ocproxy ] || log "note: build the proxy with ./build-ocproxy.sh and install dist/ocproxy-arm64"
	/etc/init.d/ocproxy enable
	/etc/init.d/ocproxy restart 2>/dev/null || log "warning: opencode proxy did not start (configure a server first)"

	# HTTPS front door: ocgate terminates TLS on :443 with the router
	# certificate and serves the app at /?oc=1 on the console origin, so the
	# page can embed it without mixed content. uhttpd keeps :80.
	mkdir -p /data/ocgate/bin
	put "$SRC/system/init.d/ocgate" /etc/init.d/ocgate 0755
	[ -f "$SRC/dist/ocgate-arm64" ] && put "$SRC/dist/ocgate-arm64" /data/ocgate/bin/ocgate 0755
	if [ -x /data/ocgate/bin/ocgate ]; then
		[ -f /root/uhttpd.bak.ocgate ] || cp /etc/config/uhttpd /root/uhttpd.bak.ocgate
		if uci -q get uhttpd.main.listen_https >/dev/null 2>&1; then
			uci -q del uhttpd.main.listen_https
			uci commit uhttpd
			/etc/init.d/uhttpd restart >/dev/null 2>&1
		fi
		/etc/init.d/ocgate enable
		/etc/init.d/ocgate restart 2>/dev/null || true
		sleep 1
		if netstat -ltn 2>/dev/null | grep -q ':443 '; then
			log "https front door on :443 (LuCI + OpenCode at /?oc=1)"
		else
			log "warning: ocgate did not bind :443, restoring uhttpd https"
			uci add_list uhttpd.main.listen_https='0.0.0.0:443'
			uci add_list uhttpd.main.listen_https='[::]:443'
			uci commit uhttpd
			/etc/init.d/uhttpd restart >/dev/null 2>&1
		fi
	fi
fi

# ---------------------------------------------------------------- web viewer
if [ "${WITH_WEBVIEW:-1}" = 1 ]; then
	log "web viewer (link-rewriting gateway)"
	mkdir -p /usr/lib/lua/luci/view/webview /data/webview/bin /www/cgi-bin
	put "$SRC/system/init.d/webview"           /etc/init.d/webview           0755
	put "$SRC/luci/controller/webview.lua"     /usr/lib/lua/luci/controller/webview.lua 0644
	put "$SRC/luci/view/webview/overview.htm"  /usr/lib/lua/luci/view/webview/overview.htm 0644
	put "$SRC/system/sbin/webview-vpn"        /usr/sbin/webview-vpn          0755
	put "$SRC/system/firewall/firewall.webviewvpn" /etc/firewall.webviewvpn   0755
	put "$SRC/system/hotplug/40-webview-vpn"  /etc/hotplug.d/iface/40-webview-vpn 0755
	seed webview "$SRC/uci/webview"
	ensure_include /etc/firewall.webviewvpn
	cron_add '* * * * * /usr/sbin/webview-vpn apply >/dev/null 2>&1'
	/usr/sbin/webview-vpn apply >/dev/null 2>&1 || true
	if [ -f "$SRC/dist/webview-arm64" ]; then
		put "$SRC/dist/webview-arm64" /data/webview/bin/webview 0755
	fi
	if [ -f "$SRC/dist/wvcgi-arm64" ]; then
		put "$SRC/dist/wvcgi-arm64" /data/webview/bin/wvcgi 0755
		ln -sf /data/webview/bin/wvcgi /www/cgi-bin/webview
	fi
	[ -x /data/webview/bin/webview ] || log "note: build the gateway with ./build-webview.sh and install dist/webview-arm64"
	[ -x /data/webview/bin/wvcgi ] || log "note: build the HTTPS bridge with ./build-wvcgi.sh and install dist/wvcgi-arm64"
	/etc/init.d/webview enable
	/etc/init.d/webview restart 2>/dev/null || log "warning: web viewer did not start"
fi

# ---------------------------------------------------------------- file shares
if [ "${WITH_FILESHARES:-1}" = 1 ]; then
	log "smb file shares"
	mkdir -p /usr/lib/lua/luci/view/fileshares /tmp/fileshares
	put "$SRC/luci/controller/fileshares.lua"    /usr/lib/lua/luci/controller/fileshares.lua 0644
	put "$SRC/luci/view/fileshares/overview.htm" /usr/lib/lua/luci/view/fileshares/overview.htm 0644
	seed fileshares "$SRC/uci/fileshares"
	[ -f /etc/fileshares.secrets ] || : > /etc/fileshares.secrets
	chmod 600 /etc/fileshares.secrets
fi

# ---------------------------------------------------------------- parental
if [ "${WITH_PARENTAL:-1}" = 1 ]; then	log "parental control"
	put "$SRC/system/firewall/firewall.parental" /etc/firewall.parental 0755
	put "$SRC/luci/controller/parental.lua" /usr/lib/lua/luci/controller/parental.lua 0644
	mkdir -p /usr/lib/lua/luci/view/parental
	put "$SRC/luci/view/parental/rules.htm"    /usr/lib/lua/luci/view/parental/rules.htm    0644
	put "$SRC/luci/view/parental/activity.htm" /usr/lib/lua/luci/view/parental/activity.htm 0644
	put "$SRC/luci/view/parental/domains.htm"  /usr/lib/lua/luci/view/parental/domains.htm  0644
	seed parental "$SRC/uci/parental"
	ensure_include /etc/firewall.parental
	cron_add '* * * * * /usr/sbin/parental-control apply >/dev/null 2>&1'
	cron_add '*/3 * * * * /usr/sbin/parental-acct >/dev/null 2>&1'
	cron_add '*/15 * * * * /usr/sbin/parental-domains refresh >/dev/null 2>&1'
	[ -f /etc/parental_usage ] || : > /etc/parental_usage
	/usr/sbin/parental-control apply >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------- logs
if [ "${WITH_LOGS:-1}" = 1 ]; then
	log "logs menu + DNS log"
	put "$SRC/luci/view/dnslog.htm"     /usr/lib/lua/luci/view/dnslog.htm     0644
	put "$SRC/luci/view/networklog.htm" /usr/lib/lua/luci/view/networklog.htm 0644
	put "$SRC/luci/view/processes.htm"  /usr/lib/lua/luci/view/processes.htm  0644
	put "$SRC/luci/view/syslog.htm"     /usr/lib/lua/luci/view/syslog.htm     0644
	put "$SRC/luci/view/dmesg.htm"      /usr/lib/lua/luci/view/dmesg.htm      0644
	put "$SRC/luci/view/srvlog.htm"     /usr/lib/lua/luci/view/srvlog.htm     0644
	put "$SRC/luci/menu.d/aw1000-logs.json" /usr/share/luci/menu.d/aw1000-logs.json 0644
	put "$SRC/luci/menu.d/luci-mod-status.json" /usr/share/luci/menu.d/luci-mod-status.json 0644
	[ -f /usr/share/luci/menu.d/luci-mod-status.json.orig ] || \
		put "$SRC/luci/menu.d/luci-mod-status.json.orig" /usr/share/luci/menu.d/luci-mod-status.json.orig 0644

	# dnsmasq must log queries to a file, not syslog
	uci set dhcp.@dnsmasq[0].logqueries='1'
	uci set dhcp.@dnsmasq[0].logfacility='/data/logs/dns.log'
	uci commit dhcp
	if [ ! -f /data/logs/dns.log ]; then
		: > /data/logs/dns.log
		chown dnsmasq:root /data/logs/dns.log 2>/dev/null || true
		chmod 640 /data/logs/dns.log
	fi

	# category tables: seed once, never overwrite local edits
	[ -f /data/dnscat/ndpi.tsv ]   || put "$SRC/data/ndpi-categories.tsv" /data/dnscat/ndpi.tsv 0644
	[ -f /data/dnscat/custom.tsv ] || put "$SRC/data/dnscat-custom.tsv"   /data/dnscat/custom.tsv 0644

	cron_add '*/30 * * * * /usr/sbin/dnslog-rotate >/dev/null 2>&1'
	cron_add '0 0,12 * * * /usr/sbin/dnslog-clear >/dev/null 2>&1'
	cron_add '*/30 * * * * /usr/sbin/port-scan-all >/dev/null 2>&1'
	cron_add '0 4 1 * * /usr/sbin/oui-update >/dev/null 2>&1'
	cron_add '0 5 * * 0 /usr/sbin/dnscat-update >/dev/null 2>&1'
fi

# ---------------------------------------------------------------- SIEM forwarding
if [ "${WITH_SIEM:-1}" = 1 ]; then
	log "SIEM log forwarding"
	put "$SRC/system/sbin/siem-forward" /usr/sbin/siem-forward 0755
	mkdir -p /usr/lib/siem
	put "$SRC/system/sbin/siem-send.lua" /usr/lib/siem/send.lua 0644
	put "$SRC/system/init.d/siem"       /etc/init.d/siem       0755
	put "$SRC/luci/controller/siem.lua" /usr/lib/lua/luci/controller/siem.lua 0644
	put "$SRC/luci/view/siem.htm"       /usr/lib/lua/luci/view/siem.htm       0644
	seed siem "$SRC/uci/siem"
	/etc/init.d/siem enable
	# A seeded config is disabled until an endpoint and token exist; restart is
	# a no-op in that state and logs "service disabled".
	/etc/init.d/siem restart 2>/dev/null || true
fi

# ---------------------------------------------------------------- wan failover
if [ "${WITH_WANFAILOVER:-1}" = 1 ]; then
	log "uplink failover"
	put "$SRC/system/init.d/wanfailover" /etc/init.d/wanfailover 0755
	seed wanfailover "$SRC/uci/wanfailover"
	# Secret file: never overwritten once it exists (it holds the bot token).
	[ -f /etc/wan-notify.conf ] || put "$SRC/system/wan-notify.conf" /etc/wan-notify.conf 0600
	cron_add '0 9 * * * /usr/sbin/wan-notify heartbeat >/dev/null 2>&1'
	/etc/init.d/wanfailover enable
	/etc/init.d/wanfailover restart 2>/dev/null || \
		log "warning: failover started but no isp uplink yet (see docs/INSTALL.md §4)"
fi

# ---------------------------------------------------------------- vpn split
if [ "${WITH_VPNSPLIT:-1}" = 1 ]; then
	log "VPN split tunnel"
	put "$SRC/system/init.d/vpnsplit" /etc/init.d/vpnsplit 0755
	put "$SRC/system/firewall/firewall.vpnsplit" /etc/firewall.vpnsplit 0755
	put "$SRC/system/hotplug/30-vpnsplit" /etc/hotplug.d/iface/30-vpnsplit 0755
	put "$SRC/luci/controller/vpnsplit.lua" /usr/lib/lua/luci/controller/vpnsplit.lua 0644
	mkdir -p /usr/lib/lua/luci/model/cbi/vpnsplit
	put "$SRC/luci/model/cbi/vpnsplit/domains.lua" /usr/lib/lua/luci/model/cbi/vpnsplit/domains.lua 0644
	seed vpnsplit "$SRC/uci/vpnsplit"
	ensure_include /etc/firewall.vpnsplit
	cron_add '* * * * * /usr/sbin/vpnplit-route >/dev/null 2>&1'
	cron_add '*/5 * * * * /usr/sbin/vpnsplit-warm >/dev/null 2>&1'
	/etc/init.d/vpnsplit enable
fi

# ---------------------------------------------------------------- captive portal
if [ "${WITH_CAPTIVEPORTAL:-1}" = 1 ]; then
	log "captive portal"
	mkdir -p /www/portal/cgi-bin
	put "$SRC/portal/index.html" /www/portal/index.html 0644
	put "$SRC/portal/splash"     /www/portal/cgi-bin/splash 0755
	put "$SRC/portal/accept"     /www/portal/cgi-bin/accept 0755
	put "$SRC/system/init.d/captiveportal" /etc/init.d/captiveportal 0755
	put "$SRC/system/firewall/firewall.captiveportal" /etc/firewall.captiveportal 0755
	mkdir -p /etc/hotplug.d/dhcp
	put "$SRC/system/hotplug/30-captiveportal" /etc/hotplug.d/dhcp/30-captiveportal 0755
	put "$SRC/luci/controller/captiveportal.lua" /usr/lib/lua/luci/controller/captiveportal.lua 0644
	put "$SRC/luci/view/captiveportal/overview.htm" /usr/lib/lua/luci/view/captiveportal/overview.htm 0644
	[ -f /etc/captiveportal.terms.txt ] || put "$SRC/portal/terms.txt" /etc/captiveportal.terms.txt 0644
	seed captiveportal "$SRC/uci/captiveportal"
	# migrate the old radio-oriented setting to the interface selector
	if [ -z "$(uci -q get captiveportal.main.gate_iface || true)" ]; then
		uci set captiveportal.main.gate_iface='br-lan'
		uci -q delete captiveportal.main.local_ifaces || true
		uci commit captiveportal
		log "captiveportal: gate_iface=br-lan"
	fi
	ensure_include /etc/firewall.captiveportal
	cron_add '* * * * * /usr/sbin/captiveportal sync >/dev/null 2>&1'
	/etc/init.d/captiveportal enable
	/etc/init.d/captiveportal restart
	/usr/sbin/captiveportal apply >/dev/null 2>&1 || true

fi

# ---------------------------------------------------------------- cloudflare
if [ "${WITH_CLOUDFLARE:-1}" = 1 ]; then
	log "cloudflare ddns + tunnel"
	put "$SRC/system/init.d/cloudflare-ddns" /etc/init.d/cloudflare-ddns 0755
	put "$SRC/system/init.d/cloudflared"     /etc/init.d/cloudflared     0755
	put "$SRC/luci/controller/cloudflare.lua" /usr/lib/lua/luci/controller/cloudflare.lua 0644
	mkdir -p /usr/lib/lua/luci/view/cloudflare
	put "$SRC/luci/view/cloudflare/ddns.htm"    /usr/lib/lua/luci/view/cloudflare/ddns.htm    0644
	put "$SRC/luci/view/cloudflare/tunnels.htm" /usr/lib/lua/luci/view/cloudflare/tunnels.htm 0644
	seed cloudflare "$SRC/uci/cloudflare"

	[ -x /data/cloudflare/bin/cloudflared ] && \
		ln -sf /data/cloudflare/bin/cloudflared /usr/bin/cloudflared
	[ -x /data/cloudflare/bin/cloudflare-ddns ] && \
		ln -sf /data/cloudflare/bin/cloudflare-ddns /usr/bin/cloudflare-ddns

	/etc/init.d/cloudflare-ddns enable
	/etc/init.d/cloudflared enable
	/etc/init.d/cloudflare-ddns restart 2>/dev/null || true
	/etc/init.d/cloudflared restart 2>/dev/null || true
	[ -x /data/cloudflare/bin/cloudflared ] || \
		log "note: cloudflared binary missing — see docs/INSTALL.md §6"
fi

# ---------------------------------------------------------------- vendor patches
if [ "${WITH_VENDOR_PATCHES:-1}" = 1 ]; then
	log "patched vendor interfaces.js"
	V=/www/luci-static/resources/view/network/interfaces.js
	[ -f "$V.orig" ] || { [ -f "$V" ] && cp -f "$V" "$V.orig"; }
	put "$SRC/vendor-patches/interfaces.js" "$V" 0644
	put "$SRC/luci/controller/ifstats.lua" /usr/lib/lua/luci/controller/ifstats.lua 0644
	L=/www/luci-static/resources/view/modem/lockband.js
	if [ -f "$L" ]; then
		[ -f "$L.orig" ] || cp -f "$L" "$L.orig"
		put "$SRC/vendor-patches/lockband.js" "$L" 0644
		log "patched 3ginfo Lock Band radio restore"
	fi
	put "$SRC/vendor-patches/wifi-help.css" /www/luci-static/resources/wifi-help.css 0644
	put "$SRC/vendor-patches/wifi-help.js"  /www/luci-static/resources/wifi-help.js 0644
	W=/usr/lib/lua/luci/view/admin_mtk/mtk_wifi_vif_cfg.htm
	if [ -f "$W" ]; then
		[ -f "$W.orig" ] || cp -f "$W" "$W.orig"
		put "$SRC/vendor-patches/mtk_wifi_vif_cfg.htm" "$W" 0644
		log "simplified Wi-Fi add/edit form"
	fi
	O=/usr/lib/lua/luci/view/admin_mtk/mtk_wifi_overview.htm
	if [ -f "$O" ]; then
		[ -f "$O.orig" ] || cp -f "$O" "$O.orig"
		put "$SRC/vendor-patches/mtk_wifi_overview.htm" "$O" 0644
		log "friendly Wi-Fi overview mode names"
	fi
	D=/usr/lib/lua/luci/view/admin_mtk/mtk_wifi_dev_cfg.htm
	if [ -f "$D" ]; then
		[ -f "$D.orig" ] || cp -f "$D" "$D.orig"
		put "$SRC/vendor-patches/mtk_wifi_dev_cfg.htm" "$D" 0644
		log "Wi-Fi radio setting help"
	fi
	M=/usr/lib/lua/luci/controller/mtkwifi.lua
	if [ -f "$M" ]; then
		[ -f "$M.orig" ] || cp -f "$M" "$M.orig"
		put "$SRC/vendor-patches/mtkwifi.lua" "$M" 0644
		log "patched Wi-Fi controller guest hook"
	fi
	put "$SRC/system/sbin/wifi-guest" /usr/sbin/wifi-guest 0755
	put "$SRC/system/init.d/wifi-guest" /etc/init.d/wifi-guest 0755
	mkdir -p /etc/hotplug.d/iface
	put "$SRC/system/hotplug/30-wifi-guest" /etc/hotplug.d/iface/30-wifi-guest 0755
	seed wifi_guest "$SRC/uci/wifi_guest"
	put "$SRC/luci/controller/guestwireless.lua" /usr/lib/lua/luci/controller/guestwireless.lua 0644
	mkdir -p /usr/lib/lua/luci/view/guestwireless
	put "$SRC/luci/view/guestwireless/overview.htm" /usr/lib/lua/luci/view/guestwireless/overview.htm 0644
	put "$SRC/luci/view/guestwireless/devices.htm"  /usr/lib/lua/luci/view/guestwireless/devices.htm 0644
	put "$SRC/luci/view/guestwireless/logs.htm"     /usr/lib/lua/luci/view/guestwireless/logs.htm 0644
	/etc/init.d/wifi-guest enable
	/etc/init.d/wifi-guest start 2>/dev/null || true
	log "guest Wi-Fi bridge + page ready (Wireless -> Guest Wireless)"
fi

# Only useful when the stock Bootstrap theme is active: it fixes double-escaped
# '&' in menu titles. Off by default.
if [ "${WITH_BOOTSTRAP_PATCHES:-0}" = 1 ]; then
	log "bootstrap title-escaping patch"
	B=/usr/lib/lua/luci/view/themes/bootstrap
	if [ -f "$B/header.htm" ]; then
		[ -f "$B/header.htm.orig" ] || cp -f "$B/header.htm" "$B/header.htm.orig"
		put "$SRC/vendor-patches/bootstrap-header.htm" "$B/header.htm" 0644
	fi
	M=/www/luci-static/resources/menu-bootstrap.js
	if [ -f "$M" ]; then
		[ -f "$M.orig" ] || cp -f "$M" "$M.orig"
		put "$SRC/vendor-patches/menu-bootstrap.js" "$M" 0644
	fi
fi

# ---------------------------------------------------------------- finish
log "cron"
/etc/init.d/cron restart >/dev/null 2>&1 || true

log "cache + reload"
rm -rf /tmp/luci-modulecache /tmp/luci-indexcache* 2>/dev/null || true
/etc/init.d/firewall reload >/dev/null 2>&1 || true
/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
/etc/init.d/uhttpd restart >/dev/null 2>&1 || true

rm -rf "$SRC/DONE" 2>/dev/null || true

echo
echo "installed. backup: $BK"
uci show luci.main.mediaurlbase 2>/dev/null || true
