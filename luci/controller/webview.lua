module("luci.controller.webview", package.seeall)

-- Web Viewer: link-rewriting gateway (Network -> Web Viewer).
-- You enter a URL on the gateway page; the router fetches it and serves it
-- back with links/assets rewritten. Service: /etc/init.d/webview,
-- configuration: /etc/config/webview, binary: /data/webview/bin/webview.

function index()
	-- Tools is a top-level section between Network and Services.
	entry({"admin", "tools"}, firstchild(), _("Tools"), 55).dependent = false

	entry({"admin", "tools", "webview"}, template("webview/overview"), _("Web Viewer"), 10).dependent = false
	entry({"admin", "tools", "webview", "status"}, call("action_status")).leaf = true
	entry({"admin", "tools", "webview", "save"}, call("action_save")).leaf = true

	-- Old location kept as a redirect so bookmarks still work.
end

local function trim(s)
	s = (s or ""):gsub("^%s+", "")
	return (s:gsub("%s+$", ""))
end

local function lan_ip()
	local ip = require("luci.model.uci").cursor():get("network", "lan", "ipaddr")
	if not ip or ip == "" then ip = "192.168.0.1" end
	return ip
end

function action_status()
	local http = require "luci.http"
	local sys  = require "luci.sys"
	local fs   = require "nixio.fs"
	local c = require("luci.model.uci").cursor()

	local port = tonumber(c:get("webview", "settings", "port") or 8090)
	local st = {
		enabled = (c:get("webview", "settings", "enabled") or "1") == "1",
		port = port,
		lan_ip = lan_ip(),
		installed = fs.access("/data/webview/bin/webview") ~= nil,
		running = (sys.call("pgrep -f '[w]ebview -addr' >/dev/null 2>&1") == 0),
		vpn = (c:get("webview", "settings", "vpn") or "1") == "1"
	}
	if st.vpn then
		local out = sys.exec("/usr/sbin/webview-vpn status 2>/dev/null") or ""
		st.vpn_state = out:match("state=(%w+)") or "unknown"
		st.vpn_age = tonumber(out:match("handshake_age=(%-?%d+)")) or -1
		st.vpn_iface = out:match("vpn=(%w+)") or "wgvpn"
	end
	st.url = "http://" .. st.lan_ip .. ":" .. port .. "/"

	http.prepare_content("application/json")
	http.header("Cache-Control", "no-store")
	http.write_json(st)
end

function action_save()
	local http = require "luci.http"
	local c = require("luci.model.uci").cursor()
	local sys = require "luci.sys"
	local disp = require "luci.dispatcher"

	if http.formvalue("token") ~= (disp.context.authtoken or "") then
		http.redirect(disp.build_url("admin", "tools", "webview") .. "?error=1")
		return
	end

	local port = tonumber(trim(http.formvalue("port"))) or 8090
	if port < 1024 or port > 65535 then port = 8090 end

	c:set("webview", "settings", "settings")
	c:set("webview", "settings", "enabled", (http.formvalue("enabled") == "1") and "1" or "0")
	c:set("webview", "settings", "port", tostring(port))
	c:commit("webview")

	if http.formvalue("enabled") == "1" then
		sys.call("/etc/init.d/webview enable >/dev/null 2>&1")
	else
		sys.call("/etc/init.d/webview disable >/dev/null 2>&1")
	end
	sys.call("/etc/init.d/webview restart >/dev/null 2>&1")

	http.redirect(disp.build_url("admin", "tools", "webview") .. "?saved=1")
end
