module("luci.controller.captiveportal", package.seeall)

-- Guest Wi-Fi captive portal: splash / terms page + acceptance log.
-- Settings: /etc/config/captiveportal, terms: /etc/captiveportal.terms.txt.
--
-- Enforcement is scoped to one network interface (gate_iface). On this
-- firmware the radios are bridged into br-lan, so the interface to select is
-- the bridge, not ra0/rai0.

function index()
	-- The portal belongs with the Wi-Fi stack: admin/mtk is the Wireless menu
	-- (mtkwifi.lua). Not a leaf: a leaf node stops path descent, so /save and
	-- /status would resolve back to this page instead of their handlers.
	entry({"admin", "mtk", "captiveportal"}, template("captiveportal/overview"), _("Captive Portal"), 2).dependent = false
	entry({"admin", "mtk", "captiveportal", "save"}, call("action_save")).leaf = true
	entry({"admin", "mtk", "captiveportal", "status"}, call("action_status")).leaf = true
end

local function trim(s)
	return (s or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local oui_cache
local function vendor(mac)
	if not oui_cache then
		oui_cache = {}
		local f = io.open("/data/oui/oui.tsv", "r")
		if f then
			for line in f:lines() do
				local p, v = line:match("^(%x+)\t(.+)$")
				if p then oui_cache[p] = v end
			end
			f:close()
		end
	end
	local s = (mac or ""):lower():gsub(":", "")
	return oui_cache[s:sub(1,10)] or oui_cache[s:sub(1,9)] or
		oui_cache[s:sub(1,7)] or oui_cache[s:sub(1,6)] or "-"
end

local function portal_running()
	-- the bracket keeps grep from matching the shell that runs it
	return require("luci.sys").call("ps w | grep '[u]httpd' | grep -q 'www/portal'") == 0
end

local function count_set(name)
	local raw = require("luci.sys").exec("ipset list " .. name .. " 2>/dev/null | awk '/^Number of entries/ {print $4}'") or "0"
	return tonumber((trim(raw))) or 0
end

local function read_accepts(limit)
	local uci = require("luci.model.uci").cursor()
	local path = uci:get("captiveportal", "main", "log_file") or "/data/portal/accept.log"
	local fs = require "nixio.fs"
	local out = {}
	if not fs.access(path) then return out, path end
	local f = io.open(path, "r")
	if not f then return out, path end
	local lines = {}
	for line in f:lines() do
		if line ~= "" then lines[#lines + 1] = line end
	end
	f:close()
	for i = math.max(1, #lines - (limit or 15) + 1), #lines do
		local f = {}
		for v in (lines[i] .. "|"):gmatch("([^|]*)|") do
			f[#f + 1] = (v:gsub("^%s+", ""):gsub("%s+$", ""))
		end
		if #f >= 6 then
			out[#out + 1] = {
				ts = f[1], ip = f[2], mac = f[3], cc = f[4], target = f[5], ua = f[6],
				vendor = (f[7] and f[7] ~= "") and f[7] or vendor(f[3])
			}
		elseif #f >= 5 then
			out[#out + 1] = {
				ts = f[1], ip = f[2], mac = f[3], cc = "-", target = f[4], ua = f[5],
				vendor = vendor(f[3])
			}
		end
	end
	return out, path
end

local function upload_dir()
	local fs = require "nixio.fs"
	return fs.stat("/data", "type") and "/data/portal" or "/tmp/portal"
end

local function valid_iface(name)
	-- Linux device names: letters, digits, _ . - : (no slash, no "..")
	return name ~= "" and not name:find("%.%.")
		and name:match("^[%w_][%w_%.%-:]*$") ~= nil
end

function action_status()
	local http = require "luci.http"
	local uci  = require("luci.model.uci").cursor()

	local port = uci:get("captiveportal", "main", "port") or "8088"
	local gate = uci:get("captiveportal", "main", "gate_iface") or "br-lan"
	local accepts = read_accepts(15)

	local today = os.date("%Y-%m-%d")
	local count = 0
	for _, a in ipairs(select(1, read_accepts(100000))) do
		if a.ts:sub(1, 10) == today then count = count + 1 end
	end

	http.prepare_content("application/json")
	http.write_json({
		running = portal_running(),
		enabled = (uci:get("captiveportal", "main", "enabled") ~= "0"),
		mode = "local",
		port = tonumber(port) or 8088,
		gate_iface = gate,
		today = count,
		active = count_set("portal_ok"),
		total_shown = #accepts,
		accepts = accepts,
		requests = (function()
			local out = {}
			local f = io.open("/tmp/portal-access.log", "r")
			if not f then return out end
			local lines = {}
			for line in f:lines() do if line ~= "" then lines[#lines + 1] = line end end
			f:close()
			for i = math.max(1, #lines - 11), #lines do
				local p = {}
				for v in (lines[i] .. "|"):gmatch("([^|]*)|") do p[#p + 1] = v end
				if #p >= 6 then
					out[#out + 1] = { ts = p[1], ip = p[2], mac = p[3], cc = p[4], mode = p[5], ua = p[6] }
				end
			end
			return out
		end)(),
		lan = uci:get("network", "lan", "ipaddr") or "192.168.0.1"
	})
end

function action_save()
	local http = require "luci.http"
	local uci  = require("luci.model.uci").cursor()
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"
	local fs   = require "nixio.fs"

	local port = tonumber(http.formvalue("port") or 8088) or 8088
	if port < 1 or port > 65535 then port = 8088 end

	local minutes = tonumber(http.formvalue("session_minutes") or 240) or 240
	if minutes < 1 or minutes > 10080 then minutes = 240 end

	-- Exempt devices never see the portal (phones, admin laptops).
	local exempt = {}
	for m in (http.formvalue("exempt") or ""):gmatch("[^%s,]+") do
		m = m:lower():gsub("-", ":")
		if m:match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") then exempt[#exempt + 1] = m end
	end
	exempt = table.concat(exempt, " ")

	-- Network interface that is gated. Keep the current value when the form
	-- sends something unusable; the page only offers matchable interfaces.
	local gate_iface = trim(http.formvalue("gate_iface") or "")
	if not valid_iface(gate_iface) then
		local cur = uci:get("captiveportal", "main", "gate_iface")
		if cur and valid_iface(cur) then
			gate_iface = cur
		else
			gate_iface = "br-lan"
		end
	end

	local terms = http.formvalue("terms") or ""
	local terms_file = uci:get("captiveportal", "main", "terms_file") or "/etc/captiveportal.terms.txt"
	if terms ~= "" then
		fs.writefile(terms_file, terms:gsub("\r\n", "\n") .. "\n")
	end

	uci:set("captiveportal", "main", "portal")
	uci:set("captiveportal", "main", "enabled", (http.formvalue("enabled") == "1") and "1" or "0")
	uci:set("captiveportal", "main", "mode", "local")
	uci:set("captiveportal", "main", "gate_iface", gate_iface)
	uci:delete("captiveportal", "main", "local_ifaces")
	uci:set("captiveportal", "main", "exempt", exempt)
	uci:set("captiveportal", "main", "port", tostring(port))
	uci:set("captiveportal", "main", "title", trim(http.formvalue("title")))
	uci:set("captiveportal", "main", "subtitle", trim(http.formvalue("subtitle")))
	uci:set("captiveportal", "main", "intro", trim(http.formvalue("intro")))
	uci:set("captiveportal", "main", "session_minutes", tostring(minutes))
	uci:set("captiveportal", "main", "log_file", upload_dir() .. "/accept.log")
	uci:commit("captiveportal")

	sys.call("/etc/init.d/captiveportal restart >/dev/null 2>&1")
	sys.call("/usr/sbin/captiveportal apply >/dev/null 2>&1")

	http.redirect(disp.build_url("admin", "mtk", "captiveportal") .. "?saved=1")
end
