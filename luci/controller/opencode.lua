module("luci.controller.opencode", package.seeall)

-- OpenCode client (Network -> OpenCode).
-- Pairs with an existing OpenCode server (password or one-time pairing link)
-- and serves its web UI through ocproxy on the LAN, embedded in this page.
-- Service: /etc/init.d/ocproxy, config: /etc/config/opencode.

function index()
	entry({"admin", "tools", "opencode"}, template("opencode/overview"), _("OpenCode"), 30).dependent = false
	entry({"admin", "tools", "opencode", "status"}, call("action_status")).leaf = true
	entry({"admin", "tools", "opencode", "pair"}, call("action_pair")).leaf = true
	entry({"admin", "tools", "opencode", "save"}, call("action_save")).leaf = true
end

local function trim(s)
	s = (s or ""):gsub("^%s+", "")
	return (s:gsub("%s+$", ""))
end

local function uci()
	return require("luci.model.uci").cursor()
end

local function lan_ip()
	local ip = uci():get("network", "lan", "ipaddr")
	if not ip or ip == "" then ip = "192.168.0.1" end
	return ip
end

local function proxy_status(port)
	local sys = require "luci.sys"
	local out = sys.exec(string.format(
		"timeout 4 curl -s http://%s:%d/__status 2>/dev/null", lan_ip(), port)) or ""
	if out == "" then return nil end
	local ok, data = pcall(function() return require("luci.jsonc").parse(out) end)
	if ok and type(data) == "table" then return data end
	return nil
end

function action_status()
	local http = require "luci.http"
	local sys  = require "luci.sys"
	local fs   = require "nixio.fs"
	local c = uci()

	local port = tonumber(c:get("opencode", "settings", "port") or 8091)
	local st = {
		enabled = (c:get("opencode", "settings", "enabled") or "1") == "1",
		port = port,
		lan_ip = lan_ip(),
		upstream = c:get("opencode", "settings", "upstream") or "",
		has_password = #(c:get("opencode", "settings", "password") or "") > 0,
		has_pair_url = #(c:get("opencode", "settings", "pair_url") or "") > 0,
		installed = fs.access("/data/ocproxy/bin/ocproxy") ~= nil,
		running = (sys.call("pgrep -f '[o]cproxy -config' >/dev/null 2>&1") == 0)
	}
	st.url = "http://" .. st.lan_ip .. ":" .. port .. "/"
	local p = proxy_status(port)
	if p then
		st.paired = p.paired and true or false
		st.cookie_age = p.cookie_age
		st.error = p.error or ""
	else
		st.paired = false
		st.error = st.running and "proxy not answering on " .. st.url or "service stopped"
	end

	http.prepare_content("application/json")
	http.header("Cache-Control", "no-store")
	http.write_json(st)
end

function action_pair()
	local http = require "luci.http"
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"

	if http.formvalue("token") ~= (disp.context.authtoken or "") then
		http.prepare_content("application/json")
		http.write_json({ ok = false, error = "token" })
		return
	end

	local c = uci()
	local port = tonumber(c:get("opencode", "settings", "port") or 8091)
	local out = sys.exec(string.format(
		"timeout 30 curl -s -X POST http://%s:%d/__pair 2>/dev/null", lan_ip(), port)) or ""
	local ok, data = pcall(function() return require("luci.jsonc").parse(out) end)

	http.prepare_content("application/json")
	if ok and type(data) == "table" then
		http.write_json(data)
	else
		http.write_json({ ok = false, error = out ~= "" and trim(out) or "no answer from the proxy" })
	end
end

function action_save()
	local http = require "luci.http"
	local c = uci()
	local sys = require "luci.sys"
	local disp = require "luci.dispatcher"

	if http.formvalue("token") ~= (disp.context.authtoken or "") then
		http.redirect(disp.build_url("admin", "tools", "opencode") .. "?error=1")
		return
	end

	local upstream = trim(http.formvalue("upstream"))
	local pair_url = trim(http.formvalue("pair_url"))
	local password = http.formvalue("password") or ""

	if upstream ~= "" and not upstream:match("^https?://[^%s]+$") then upstream = "" end
	if pair_url ~= "" and not pair_url:match("^https?://[^%s]+$") then pair_url = "" end

	local port = tonumber(trim(http.formvalue("port"))) or 8091
	if port < 1024 or port > 65535 then port = 8091 end

	c:set("opencode", "settings", "settings")
	c:set("opencode", "settings", "enabled", (http.formvalue("enabled") == "1") and "1" or "0")
	c:set("opencode", "settings", "port", tostring(port))
	c:set("opencode", "settings", "upstream", upstream)
	c:set("opencode", "settings", "pair_url", pair_url)
	c:set("opencode", "settings", "insecure", (http.formvalue("insecure") == "1") and "1" or "0")
	if password ~= "" then
		c:set("opencode", "settings", "password", password)
	end
	if http.formvalue("clear_password") == "1" then
		c:set("opencode", "settings", "password", "")
	end
	c:commit("opencode")

	if upstream == "" and pair_url == "" then
		http.redirect(disp.build_url("admin", "tools", "opencode") .. "?noupstream=1")
		return
	end

	if http.formvalue("enabled") == "1" then
		sys.call("/etc/init.d/ocproxy enable >/dev/null 2>&1")
	else
		sys.call("/etc/init.d/ocproxy disable >/dev/null 2>&1")
	end
	sys.call("/etc/init.d/ocproxy restart >/dev/null 2>&1")

	http.redirect(disp.build_url("admin", "tools", "opencode") .. "?saved=1")
end
