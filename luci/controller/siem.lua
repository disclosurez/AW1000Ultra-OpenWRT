module("luci.controller.siem", package.seeall)

-- SIEM log forwarding (Services -> SIEM Forwarding).
-- Configuration: /etc/config/siem. Credentials: token_file (mode 600).
-- The service itself is /usr/sbin/siem-forward, run by /etc/init.d/siem.

function index()
	-- Not a leaf: /save, /status and /test are children of this page.
	entry({"admin", "services", "siem"}, template("siem"), _("SIEM Forwarding"), 59).dependent = false
	entry({"admin", "services", "siem", "save"}, call("action_save")).leaf = true
	entry({"admin", "services", "siem", "status"}, call("action_status")).leaf = true
	entry({"admin", "services", "siem", "test"}, call("action_test")).leaf = true
end

local SOURCES = { syslog = true, dns = true, portal = true }
local TRANSPORTS = { syslog = true, http = true }
local PROTOS = { udp = true, tcp = true, tls = true }
local FORMATS = { rfc5424 = true, rfc3164 = true }
local HTTP_FORMATS = { jsonl = true, array = true, splunk = true, raw = true }
local FACILITIES = {
	kern = true, user = true, mail = true, daemon = true, auth = true,
	syslog = true, lpr = true, news = true, uucp = true, cron = true,
	authpriv = true, ftp = true, local0 = true, local1 = true, local2 = true,
	local3 = true, local4 = true, local5 = true, local6 = true, local7 = true
}

local function trim(s)
	s = (s or ""):gsub("^%s+", "")
	s = s:gsub("%s+$", "")
	return s
end

local function one_of(v, allowed, default)
	if allowed[v] then return v end
	return default
end

local function num(v, default, lo, hi)
	local n = tonumber(trim(v))
	if not n then return default end
	n = math.floor(n)
	if lo and n < lo then n = lo end
	if hi and n > hi then n = hi end
	return n
end

local function redact_url(u)
	return ((u or ""):gsub("^(https?://)[^/@]+@", "%1***@"))
end

--------------------------------------------------------------------- status

function action_status()
	local http = require "luci.http"
	local fs   = require "nixio.fs"
	local sys  = require "luci.sys"

	local st = {}
	local raw = fs.readfile("/tmp/siem.status") or ""
	if raw == "" then
		-- Service stopped: ask the forwarder for its configured state so the
		-- page still shows the endpoint and queue counters.
		raw = sys.exec("/usr/sbin/siem-forward status 2>/dev/null") or ""
	end
	for k, v in raw:gmatch("([%w_]+)=([^\n]*)") do
		st[k] = v
	end

	if st.endpoint then st.endpoint = redact_url(st.endpoint) end

	local running = (sys.call("pgrep -f '[s]iem-forward flush-loop' >/dev/null 2>&1") == 0)
	st.running = running
	st.state = running and "running" or (st.state or "stopped")

	local log = sys.exec("logread -e 'siem' 2>/dev/null | tail -n 12") or ""

	http.prepare_content("application/json")
	http.write_json({ status = st, log = trim(log), ts = os.date("%H:%M:%S") })
end

----------------------------------------------------------------------- test

function action_test()
	local http = require "luci.http"
	local sys  = require "luci.sys"

	local out = sys.exec("/usr/sbin/siem-forward test 2>&1; echo __RC=$?") or ""
	local rc = tonumber(out:match("__RC=(%-?%d+)")) or 1
	out = out:gsub("__RC=%-?%d+\n?", ""):gsub("%s+$", "")

	http.prepare_content("application/json")
	http.write_json({ ok = (rc == 0), output = out })
end

----------------------------------------------------------------------- save

function action_save()
	local http = require "luci.http"
	local uci  = require "luci.model.uci".cursor()
	local sys  = require "luci.sys"
	local fs   = require "nixio.fs"
	local disp = require "luci.dispatcher"

	local transport = one_of(http.formvalue("transport"), TRANSPORTS, "syslog")
	local host = trim(http.formvalue("host"))
	local url  = trim(http.formvalue("url"))
	local token = (http.formvalue("api_token") or ""):gsub("%s", "")
	local token_file = trim(http.formvalue("token_file"))
	if token_file == "" then
		token_file = uci:get("siem", "target", "token_file") or "/etc/siem.token"
	end
	local tname = trim(http.formvalue("target_name"))
	if tname == "" then
		tname = uci:get("siem", "target", "name") or "siem"
	end
	local auth_header = trim(http.formvalue("auth_header"))
	if auth_header == "" or not auth_header:match("^[%w%-_]+$") then
		auth_header = "Authorization"
	end
	local sources = {}
	local src_list = ""

	for s in pairs(SOURCES) do
		if http.formvalue("src_" .. s) == "1" then sources[#sources + 1] = s end
	end
	if #sources == 0 then sources[1] = "syslog" end
	table.sort(sources)
	src_list = table.concat(sources, " ")

	if token_file == "" then token_file = "/etc/siem.token" end
	if not token_file:match("^/[%w%._/%-]+$") then token_file = "/etc/siem.token" end

	if transport == "syslog" then
		if host ~= "" and not host:match("^[%w%._%[%]][%w%._:%-%[%]]*$") then host = "" end
	else
		if not url:match("^https?://%S+$") or #url > 1024 then url = "" end
	end

	local extra = trim(http.formvalue("extra_header"))
	if #extra > 200 or extra:find("[\r\n]") then extra = "" end

	uci:set("siem", "settings", "settings")
	uci:set("siem", "settings", "enabled", (http.formvalue("enabled") == "1") and "1" or "0")
	uci:set("siem", "settings", "sources", src_list)
	uci:set("siem", "settings", "interval", tostring(num(http.formvalue("interval"), 5, 1, 300)))
	uci:set("siem", "settings", "batch", tostring(num(http.formvalue("batch"), 200, 1, 1000)))
	local spool = trim(http.formvalue("spool"))
	if spool == "" or not spool:match("^/(tmp|data)/[%w%._%-/]+$") then
		spool = "/tmp/siem"
	end
	uci:set("siem", "settings", "spool", spool)
	uci:set("siem", "settings", "spool_max_kb", tostring(num(http.formvalue("spool_max_kb"), 4096, 0, 65536)))
	uci:set("siem", "settings", "hostname", trim(http.formvalue("hostname")))
	uci:set("siem", "settings", "dns_file", trim(http.formvalue("dns_file")) ~= "" and trim(http.formvalue("dns_file")) or "/data/logs/dns.log")
	uci:set("siem", "settings", "portal_file", trim(http.formvalue("portal_file")) ~= "" and trim(http.formvalue("portal_file")) or "/data/portal/accept.log")
	uci:set("siem", "settings", "syslog_backfill", (http.formvalue("syslog_backfill") == "1") and "1" or "0")

	uci:set("siem", "target", "target")
	uci:set("siem", "target", "enabled", (http.formvalue("target_enabled") == "1") and "1" or "0")
	uci:set("siem", "target", "name", tname)
	uci:set("siem", "target", "transport", transport)
	uci:set("siem", "target", "host", host)
	uci:set("siem", "target", "port", tostring(num(http.formvalue("port"), 514, 1, 65535)))
	uci:set("siem", "target", "proto", one_of(http.formvalue("proto"), PROTOS, "tls"))
	uci:set("siem", "target", "format", one_of(http.formvalue("format"), FORMATS, "rfc5424"))
	uci:set("siem", "target", "facility", one_of(http.formvalue("facility"), FACILITIES, "local0"))
	uci:set("siem", "target", "framing", one_of(http.formvalue("framing"), { auto = true, octet = true, newline = true }, "auto"))
	uci:set("siem", "target", "tls_verify", (http.formvalue("tls_verify") == "1") and "1" or "0")
	uci:set("siem", "target", "ca_file", trim(http.formvalue("ca_file")))
	uci:set("siem", "target", "url", url)
	uci:set("siem", "target", "http_format", one_of(http.formvalue("http_format"), HTTP_FORMATS, "jsonl"))
	uci:set("siem", "target", "token_file", token_file)
	uci:set("siem", "target", "auth_header", auth_header)
	uci:set("siem", "target", "auth_scheme", trim(http.formvalue("auth_scheme")))
	uci:set("siem", "target", "extra_header", extra)
	uci:set("siem", "target", "insecure", (http.formvalue("insecure") == "1") and "1" or "0")
	uci:set("siem", "target", "drop_on_4xx", (http.formvalue("drop_on_4xx") == "1") and "1" or "0")
	uci:set("siem", "target", "timeout", tostring(num(http.formvalue("timeout"), 15, 2, 120)))
	uci:commit("siem")

	if token ~= "" and #token >= 8 and #token <= 4096 and token:match("^[%w%._%-%=%+/:]+$") then
		fs.writefile(token_file, token .. "\n")
		fs.chmod(token_file, "0600")
	end

	if http.formvalue("enabled") == "1" then
		sys.call("/etc/init.d/siem enable >/dev/null 2>&1")
	end
	sys.call("/etc/init.d/siem restart >/dev/null 2>&1")

	http.redirect(disp.build_url("admin", "services", "siem") .. "?saved=1")
end
