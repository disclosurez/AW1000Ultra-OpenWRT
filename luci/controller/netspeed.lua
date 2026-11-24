module("luci.controller.netspeed", package.seeall)

local http = require "luci.http"
local fs = require "nixio.fs"
local disp = require "luci.dispatcher"

DATA = "/data/netspeed"

function index()
	entry({"admin", "status", "netspeed"}, call("action_netspeed")).leaf = true
end

-- The speedtest binary writes one small JSON object per link; hand them to the
-- browser verbatim instead of parsing and re-encoding them here.
local function latest(link)
	local s = fs.readfile(DATA .. "/latest." .. link .. ".json")
	if not s then return "null" end
	s = s:gsub("%s+$", "")
	if s:sub(1, 1) ~= "{" then return "null" end
	return s
end

local function running()
	return fs.access("/tmp/netspeed.lock") and true or false
end

local function authed()
	local token = http.formvalue("token")
	return token ~= nil and token == (disp.context.authtoken or "")
end

function action_netspeed()
	http.prepare_content("application/json")
	http.header("Cache-Control", "no-store")

	if http.formvalue("action") == "run" then
		if not authed() then
			http.status(403, "Forbidden")
			http.write_json({ error = "bad token" })
			return
		end
		local link = http.formvalue("link")
		if link ~= "isp" and link ~= "sim" then
			http.status(400, "Bad Request")
			http.write_json({ error = "link must be isp or sim" })
			return
		end
		-- Detached: the request must return immediately, a test takes ~30 s.
		os.execute("/usr/sbin/netspeed now " .. link
			.. " >/tmp/netspeed.manual.log 2>&1 &")
	end

	http.write('{"running":' .. (running() and "true" or "false")
		.. ',"isp":' .. latest("isp")
		.. ',"sim":' .. latest("sim") .. '}')
end
