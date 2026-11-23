module("luci.controller.parental", package.seeall)

function index()
	entry({"admin", "network", "parental"}, firstchild(), _("Parental Control"), 66).dependent = false
	entry({"admin", "network", "parental", "rules"}, template("parental/rules"), _("Blocking Rules"), 10).leaf = true
	entry({"admin", "network", "parental", "domains"}, template("parental/domains"), _("Domain Blocks"), 15).leaf = true
	entry({"admin", "network", "parental", "activity"}, template("parental/activity"), _("Devices & Activity"), 20).leaf = true
	entry({"admin", "status", "parental-activity"}, alias("admin", "network", "parental", "activity"), _("Devices & Activity"), 60).leaf = true
	entry({"admin", "network", "parental", "save"}, call("action_save")).leaf = true
	entry({"admin", "network", "parental", "domains_save"}, call("action_domains_save")).leaf = true
	entry({"admin", "network", "parental", "toggle"}, call("action_toggle")).leaf = true
	entry({"admin", "network", "parental", "scan"}, call("action_scan")).leaf = true
	entry({"admin", "network", "parental", "portscan"}, call("action_portscan")).leaf = true
end

local function parse_domains(s)
	local t, seen = {}, {}

	for d in (s or ""):gmatch("[^%s,]+") do
		d = d:lower():gsub("^%*%.", "")
		if d:match("^[%w][%w%.%-]*%.[%a][%w%.%-]*$") and not seen[d] then
			t[#t + 1] = d
			seen[d] = true
		end
	end

	return t
end

local function parse_time(s)
	local h, m = (s or ""):match("^(%d%d?):(%d%d)$")
	if h and tonumber(h) <= 24 and tonumber(m) <= 59 and
	   (tonumber(h) < 24 or tonumber(m) == 0) then
		return string.format("%02d:%02d", tonumber(h), tonumber(m))
	end
	return "00:00"
end

function action_domains_save()
	local http = require "luci.http"
	local uci  = require "luci.model.uci".cursor()
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"

	local count = tonumber(http.formvalue("count_dom") or 0) or 0
	local rows  = {}

	for i = 1, count do
		local d = (http.formvalue("domain" .. i) or ""):lower():gsub("^%*%.", ""):gsub("%s+", "")

		if d:match("^[%w][%w%.%-]*%.[%a][%w%.%-]*$") then
			local days = {}
			for _, day in ipairs({"mon", "tue", "wed", "thu", "fri", "sat", "sun"}) do
				if http.formvalue("dday_" .. day .. i) == "1" then
					days[#days + 1] = day
				end
			end

			local target = http.formvalue("target" .. i) or "all"
			if target ~= "all" and not target:match("^mac:%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") then
				target = "all"
			end

			rows[#rows + 1] = {
				enabled = (http.formvalue("denabled" .. i) == "1") and "1" or "0",
				domain  = d,
				target  = target,
				start   = parse_time(http.formvalue("dstart" .. i)),
				["end"] = parse_time(http.formvalue("dend" .. i)),
				days    = table.concat(days, " ")
			}
		end
	end

	local old = {}
	uci:foreach("parental", "domain", function(s)
		old[#old + 1] = s[".name"]
	end)
	for _, s in ipairs(old) do
		uci:delete("parental", s)
	end

	for _, r in ipairs(rows) do
		uci:section("parental", "domain", nil, {
			enabled = r.enabled,
			domain  = r.domain,
			target  = r.target,
			start   = r.start,
			["end"] = r["end"],
			days    = r.days
		})
	end

	uci:commit("parental")
	sys.call("/usr/sbin/parental-domains sync >/dev/null 2>&1")
	sys.call("/usr/sbin/parental-control apply >/dev/null 2>&1")

	http.redirect(disp.build_url("admin/network/parental/domains"))
end

function action_save()
	local http = require "luci.http"
	local uci  = require "luci.model.uci".cursor()
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"

	local count = tonumber(http.formvalue("count") or 0) or 0
	local rows  = {}

	for i = 1, count do
		local mac = http.formvalue("mac" .. i)
		local manual = http.formvalue("mac_manual" .. i) or ""

		if manual:match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") then
			mac = manual
		end

		if mac and mac:match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") then
			local days = {}

			for _, d in ipairs({"mon", "tue", "wed", "thu", "fri", "sat", "sun"}) do
				if http.formvalue("day_" .. d .. i) == "1" then
					days[#days + 1] = d
				end
			end

			rows[#rows + 1] = {
				enabled = (http.formvalue("enabled" .. i) == "1") and "1" or "0",
				name    = http.formvalue("name" .. i) or "",
				mac     = mac:lower(),
				mode    = (http.formvalue("mode" .. i) == "ban") and "ban" or "schedule",
				start   = http.formvalue("start" .. i) or "00:00",
				["end"] = http.formvalue("end" .. i) or "24:00",
				days    = table.concat(days, " ")
			}
		end
	end

	local old = {}
	uci:foreach("parental", "device", function(s)
		old[#old + 1] = s[".name"]
	end)
	for _, s in ipairs(old) do
		uci:delete("parental", s)
	end

	if not uci:get("parental", "settings") then
		uci:section("parental", "settings", "settings", {})
	end

	for _, r in ipairs(rows) do
		uci:section("parental", "device", nil, {
			enabled = r.enabled,
			name    = r.name,
			mac     = r.mac,
			mode    = r.mode,
			start   = r.start,
			["end"] = r["end"],
			days    = r.days
		})
	end

	uci:commit("parental")
	sys.call("/usr/sbin/parental-domains sync >/dev/null 2>&1")
	sys.call("/usr/sbin/parental-control apply >/dev/null 2>&1")

	http.redirect(disp.build_url("admin/network/parental/rules"))
end

function action_toggle()
	local http = require "luci.http"
	local uci  = require "luci.model.uci".cursor()
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"

	local mac = (http.formvalue("mac") or ""):lower()
	local op  = http.formvalue("op") or ""
	local name = http.formvalue("name") or mac

	if mac:match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") then
		local sections = {}
		uci:foreach("parental", "device", function(s)
			if (s.mac or ""):lower() == mac then
				sections[#sections + 1] = s[".name"]
			end
		end)

		if op == "block" then
			local exempt = false
			uci:foreach("parental", "settings", function(s)
				local ex = s.exempt
				if type(ex) == "table" then
					for _, m in ipairs(ex) do
						if m:lower() == mac then exempt = true end
					end
				elseif type(ex) == "string" then
					for m in ex:gmatch("%S+") do
						if m:lower() == mac then exempt = true end
					end
				end
			end)

			if not exempt and #sections == 0 then
				uci:section("parental", "device", nil, {
					enabled = "1",
					name = name,
					mac = mac,
					mode = "ban",
					start = "00:00",
					["end"] = "24:00",
					days = ""
				})
			end
		elseif op == "unblock" then
			for _, s in ipairs(sections) do
				uci:delete("parental", s)
			end
		end

		uci:commit("parental")
		sys.call("/usr/sbin/parental-control apply >/dev/null 2>&1")
	end

	if (http.formvalue("redirect") or "") == "guest" then
		http.redirect(disp.build_url("admin", "mtk", "guestwireless", "devices"))
		return
	end

	local scope = http.formvalue("scope") or "all"
	if scope ~= "lan" and scope ~= "guest" then scope = "all" end
	http.redirect(disp.build_url("admin/network/parental/activity") .. "?scope=" .. scope)
end

function action_scan()
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"
	local http = require "luci.http"

	sys.call("/usr/sbin/lan-scan >/dev/null 2>&1")
	local scope = http.formvalue("scope") or "all"
	if scope ~= "lan" and scope ~= "guest" then scope = "all" end
	http.redirect(disp.build_url("admin/network/parental/activity") .. "?scope=" .. scope)
end

function action_portscan()
	local http = require "luci.http"
	local sys  = require "luci.sys"
	local fs   = require "nixio.fs"
	local disp = require "luci.dispatcher"

	local ip = http.formvalue("ip") or ""

	if ip:match("^%d+%.%d+%.%d+%.%d+$") then
		local ports = (sys.exec("/usr/sbin/port-scan " .. ip .. " 2>/dev/null") or ""):gsub("%s+$", "")
		local cache = {}
		local cur = fs.readfile("/tmp/portscan.cache") or ""

		for line in cur:gmatch("[^\n]+") do
			local i = line:match("^([^|]+)|")
			if i and i ~= ip then
				cache[#cache + 1] = line
			end
		end

		cache[#cache + 1] = ip .. "|" .. ports .. "|" .. os.time()
		fs.writefile("/tmp/portscan.cache", table.concat(cache, "\n") .. "\n")
	end

	local scope = http.formvalue("scope") or "all"
	if scope ~= "lan" and scope ~= "guest" then scope = "all" end
	http.redirect(disp.build_url("admin/network/parental/activity") .. "?scope=" .. scope)
end
