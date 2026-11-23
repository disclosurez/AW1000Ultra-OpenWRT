module("luci.controller.cloudflare", package.seeall)

-- Cloudflare DDNS + Tunnel (cloudflared) control pages.
-- Settings: /etc/config/cloudflare.  Tokens: /etc/cloudflare-*.token (mode 600).

function index()
	entry({"admin", "services", "cloudflare"}, firstchild(), _("Cloudflare"), 57).dependent = false
	entry({"admin", "services", "cloudflare", "ddns"}, template("cloudflare/ddns"), _("Dynamic DNS"), 10).leaf = true
	entry({"admin", "services", "cloudflare", "tunnels"}, template("cloudflare/tunnels"), _("Tunnels"), 20).leaf = true
	entry({"admin", "services", "cloudflare", "save_ddns"}, call("action_save_ddns")).leaf = true
	entry({"admin", "services", "cloudflare", "save_tunnels"}, call("action_save_tunnels")).leaf = true
	entry({"admin", "services", "cloudflare", "status"}, call("action_status")).leaf = true
end

local DDNS_TAG = "cloudflare-ddns"
local CFD_TAG  = "cloudflared"

-------------------------------------------------------------------- helpers

local function trim(s)
	return (s or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function parse_domains(s)
	local out, seen = {}, {}
	for d in (s or ""):gmatch("[^%s,]+") do
		d = d:lower():gsub("^%*%.", "")
		if d:match("^[%w][%w%.%-]*%.[%a][%w%.%-]*$") and not seen[d] then
			seen[d] = true
			out[#out + 1] = d
		end
	end
	return out
end

local function running_ddns()
	-- the bracket keeps pgrep from matching the shell that runs it
	return require("luci.sys").call("ps w | grep '[c]loudflare-ddns' >/dev/null 2>&1") == 0
end

local function running_tunnel(token_file)
	local base = (token_file or ""):match("[^/]+$") or ""
	if base == "" then return false end
	return require("luci.sys").call("ps w | grep '[c]loudflared' | grep -q '" .. base .. "'") == 0
end

local function logtail(tag, n)
	local out = require("luci.sys").exec("logread -e '" .. tag .. "' 2>/dev/null | tail -n " .. tostring(n or 8))
	return trim(out)
end

local function wan_ip()
	local out = require("luci.sys").exec("ip route get 1.1.1.1 2>/dev/null")
	return (out or ""):match("src%s+(%d+%.%d+%.%d+%.%d+)")
end

local function resolve4(name)
	local ips, seen = {}, {}
	if not name or name == "" then return ips end
	local out = require("luci.sys").exec("nslookup " .. name .. " 127.0.0.1 2>/dev/null")
	for ip in (out or ""):gmatch("[Aa]ddress%s*%d*:?%s*(%d+%.%d+%.%d+%.%d+)") do
		if not ip:match("^127%.") and not seen[ip] then
			seen[ip] = true
			ips[#ips + 1] = ip
		end
	end
	return ips
end

local function write_secret(path, value)
	local fs = require "nixio.fs"
	if not fs.writefile(path, value .. "\n") then return false end
	fs.chmod(path, "0600") -- nixio expects a string mode, not a number
	return true
end

local function slug(s)
	s = (s or ""):lower():gsub("[^%w]+", "_"):gsub("^_+", ""):gsub("_+$", "")
	if s == "" then s = "tunnel" end
	return s:sub(1, 24)
end

--------------------------------------------------------------------- status

function action_status()
	local http = require "luci.http"
	local uci  = require("luci.model.uci").cursor()
	local fs   = require "nixio.fs"

	local domains = uci:get("cloudflare", "ddns", "domains") or ""
	local token_file = uci:get("cloudflare", "ddns", "token_file") or "/etc/cloudflare-ddns.token"

	local dns = {}
	for _, d in ipairs(parse_domains(domains)) do
		local ips = resolve4(d)
		dns[#dns + 1] = { name = d, ip = ips[1] or "" }
	end

	local tunnels = {}
	uci:foreach("cloudflare", "tunnel", function(s)
		local tf = s.token_file or ("/etc/cloudflare-tunnel-" .. s[".name"] .. ".token")
		tunnels[#tunnels + 1] = {
			section = s[".name"],
			name    = s.name or s[".name"],
			enabled = (s.enabled == "1"),
			token   = (fs.access(tf) and (fs.stat(tf, "size") or 0) > 0) and true or false,
			running = running_tunnel(tf)
		}
	end)

	http.prepare_content("application/json")
	http.write_json({
		ddns = {
			running = running_ddns(),
			enabled = (uci:get("cloudflare", "ddns", "enabled") ~= "0"),
			has_token = (fs.access(token_file) and (fs.stat(token_file, "size") or 0) > 0) and true or false,
			domains = domains,
			wan = wan_ip(),
			dns = dns,
			ts = os.date("%H:%M:%S")
		},
		tunnels = tunnels,
		log = logtail(DDNS_TAG, 8)
	})
end

----------------------------------------------------------------- ddns save

function action_save_ddns()
	local http = require "luci.http"
	local uci  = require("luci.model.uci").cursor()
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"

	local domains = table.concat(parse_domains(http.formvalue("domains")), " ")
	local ip4 = trim(http.formvalue("ip4_provider"))
	local ip6 = trim(http.formvalue("ip6_provider"))
	local cron = trim(http.formvalue("update_cron"))
	local token = (http.formvalue("api_token") or ""):gsub("%s", "")
	local enabled = (http.formvalue("enabled") == "1") and "1" or "0"
	local token_file = uci:get("cloudflare", "ddns", "token_file") or "/etc/cloudflare-ddns.token"

	if ip4 == "" or not ip4:match("^[%w%._%-]+:?[%w%._%/%?=&:%-]*$") then ip4 = "cloudflare.trace" end
	if ip6 == "" or not ip6:match("^[%w%._%-]+:?[%w%._%/%?=&:%-]*$") then ip6 = "none" end
	if cron == "" then cron = "@every 5m" end
	if token ~= "" and not token:match("^[%w_%-%.%=%+%/]+$") then token = "" end

	uci:set("cloudflare", "ddns", "ddns")
	uci:set("cloudflare", "ddns", "enabled", enabled)
	uci:set("cloudflare", "ddns", "domains", domains)
	uci:set("cloudflare", "ddns", "proxied", (http.formvalue("proxied") == "1") and "1" or "0")
	uci:set("cloudflare", "ddns", "ip4_provider", ip4)
	uci:set("cloudflare", "ddns", "ip6_provider", ip6)
	uci:set("cloudflare", "ddns", "update_cron", cron)
	uci:set("cloudflare", "ddns", "token_file", token_file)
	uci:commit("cloudflare")

	if token ~= "" and #token >= 20 then
		write_secret(token_file, token)
	end

	sys.call("/etc/init.d/cloudflare-ddns restart >/dev/null 2>&1")

	http.redirect(disp.build_url("admin", "services", "cloudflare", "ddns") .. "?saved=1")
end

-------------------------------------------------------------- tunnels save

function action_save_tunnels()
	local http = require "luci.http"
	local uci  = require("luci.model.uci").cursor()
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"
	local fs   = require "nixio.fs"

	local count = tonumber(http.formvalue("count") or 0) or 0
	local rows, used = {}, {}

	for i = 1, count do
		local name = trim(http.formvalue("name" .. i))
		local token = (http.formvalue("token" .. i) or ""):gsub("%s", "")
		local enabled = (http.formvalue("enabled" .. i) == "1") and "1" or "0"

		if name ~= "" and name:match("^[%w%._%- ]+$") then
			local sec = "t_" .. slug(name)
			while used[sec] do sec = sec .. "_" end
			used[sec] = true
			rows[#rows + 1] = { section = sec, name = name, token = token, enabled = enabled }
		end
	end

	local old = {}
	uci:foreach("cloudflare", "tunnel", function(s)
		old[s[".name"]] = s.token_file or ("/etc/cloudflare-tunnel-" .. s[".name"] .. ".token")
	end)

	-- A form that posted no usable rows must not wipe the configuration
	-- (browser autofill, a stale page or an empty submit would otherwise
	-- delete every tunnel and its token). Treat it as a no-op instead.
	if #rows == 0 then
		for sec in pairs(old) do
			used[sec] = true
		end
	end

	for sec in pairs(old) do
		if not used[sec] then
			uci:delete("cloudflare", sec)
		end
	end

	for _, r in ipairs(rows) do
		local tf = old[r.section] or ("/etc/cloudflare-tunnel-" .. r.section .. ".token")
		uci:section("cloudflare", "tunnel", r.section, {
			enabled = r.enabled,
			name = r.name,
			token_file = tf
		})
		if r.token ~= "" and #r.token >= 20 and r.token:match("^[%w_%-%.%=%+%/]+$") then
			write_secret(tf, r.token)
		end
	end

	uci:commit("cloudflare")

	for sec, tf in pairs(old) do
		if not used[sec] and tf:match("^/etc/cloudflare%-tunnel%-") then
			fs.unlink(tf)
		end
	end

	sys.call("/etc/init.d/cloudflared restart >/dev/null 2>&1")

	http.redirect(disp.build_url("admin", "services", "cloudflare", "tunnels") .. "?saved=1")
end
