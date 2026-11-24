module("luci.controller.console", package.seeall)

function index()
	entry({"admin", "status", "vitals"}, call("action_vitals")).leaf = true
	entry({"admin", "network", "vpnsplit", "status"}, call("action_vpnstatus")).leaf = true
end

local function readfile(path)
	local fs = require "nixio.fs"
	return fs.readfile(path) or ""
end

local function meminfo()
	local t = {}
	for line in readfile("/proc/meminfo"):gmatch("[^\n]+") do
		local k, v = line:match("^(%w+):%s*(%d+)")
		if k then t[k] = tonumber(v) * 1024 end
	end
	local total = t.MemTotal or 0
	local avail = t.MemAvailable or ((t.MemFree or 0) + (t.Buffers or 0) + (t.Cached or 0))
	local free = t.MemFree or 0
	return {
		total = total,
		available = avail,
		free = free,
		used = math.max(0, total - free),
		buffered = t.Buffers or 0,
		cached = t.Cached or 0,
		swap_total = t.SwapTotal or 0,
		swap_free = t.SwapFree or 0
	}
end

local function loadavg()
	local a, b, c = readfile("/proc/loadavg"):match("^(%S+)%s+(%S+)%s+(%S+)")
	return { tonumber(a) or 0, tonumber(b) or 0, tonumber(c) or 0 }
end

-- CPU busy share over the interval between vitals calls (the overview polls
-- every 5 s). Falls back to a short in-request sample when the baseline is
-- missing or older than a minute, so the tile never shows a stale average.
local function read_cpu()
	local line = readfile("/proc/stat"):match("^cpu%s+([^\n]+)")
	if not line then return nil end
	local total, idle, i = 0, 0, 0
	for v in line:gmatch("%d+") do
		i = i + 1
		v = tonumber(v)
		total = total + v
		if i == 4 or i == 5 then idle = idle + v end
	end
	if total == 0 then return nil end
	return total, idle
end

local function cpu_usage()
	local fs = require "nixio.fs"
	local total, idle = read_cpu()
	if not total then return { usage = nil } end

	local now = os.time()
	local pt, pi, pts = readfile("/tmp/vitals.cpu"):match("^(%d+)%s+(%d+)%s+(%d+)")
	local usage = nil

	if pt and (now - tonumber(pts)) <= 60 then
		local dt = total - tonumber(pt)
		local di = idle - tonumber(pi)
		if dt > 0 then
			usage = math.floor(((dt - di) * 100 / dt) + 0.5)
		end
	end

	if not usage then
		local nixio = require "nixio"
		if pcall(function() nixio.nanosleep(0, 120000000) end) then
			local t2, i2 = read_cpu()
			local dt = (t2 or 0) - total
			if t2 and dt > 0 then
				usage = math.floor((((t2 - total) - (i2 - idle)) * 100 / dt) + 0.5)
				total, idle = t2, i2
			end
		end
	end

	if usage then
		usage = math.max(0, math.min(100, usage))
	end
	fs.writefile("/tmp/vitals.cpu", total .. " " .. idle .. " " .. os.time() .. "\n")
	return { usage = usage }
end

local function uptime()
	local s = readfile("/proc/uptime"):match("^(%d+)")
	return tonumber(s) or 0
end

-- Interface names the UI shows for the WAN zone. Kept in step with
-- IFACE_LABELS in vendor-patches/interfaces.js.
local IFACE_LABELS = { isp = "ISP", wan = "SIM", wan6 = "SIM6" }

local function wan_status_file()
	local t = {}
	for line in readfile("/tmp/wanfailover.status"):gmatch("[^\n]+") do
		local k, v = line:match("^([%w_]+)=(.*)$")
		if k then t[k] = v end
	end
	return t
end

local function wan_iface_rank(n)
	if n == "isp" then return 1 end
	if n == "wan" then return 2 end
	if n == "wan6" then return 3 end
	return 50
end

-- WAN interfaces come from the firewall "wan" zone so a renamed uplink is
-- picked up automatically; fall back to the known set if the zone is absent.
local function wan_iface_names()
	local names, seen = {}, {}
	local function add(n)
		if n and n ~= "" and not seen[n] then
			seen[n] = true
			names[#names + 1] = n
		end
	end
	pcall(function()
		local uci = require("luci.model.uci").cursor()
		uci:foreach("firewall", "zone", function(z)
			if z.name ~= "wan" then return end
			local nets = z.network
			if type(nets) == "table" then
				for _, n in ipairs(nets) do add(n) end
			elseif type(nets) == "string" then
				for n in nets:gmatch("%S+") do add(n) end
			end
		end)
	end)
	if #names == 0 then names = { "isp", "wan", "wan6" } end
	table.sort(names, function(a, b)
		local ra, rb = wan_iface_rank(a), wan_iface_rank(b)
		if ra ~= rb then return ra < rb end
		return a < b
	end)
	return names
end

local function wan_interfaces(status, active)
	local jsonc = require "luci.jsonc"
	local sys = require "luci.sys"
	local parked = (status.sim_parked == "1")
	local out = {}

	for _, name in ipairs(wan_iface_names()) do
		local st = jsonc.parse(sys.exec("ifstatus " .. name .. " 2>/dev/null") or "") or {}
		local e = {
			name = name,
			label = IFACE_LABELS[name] or name:upper(),
			proto = st.proto or "",
			up = st.up == true,
			uptime = tonumber(st.uptime) or 0,
			device = st.l3_device or st.device or ""
		}

		local a4 = st["ipv4-address"] and st["ipv4-address"][1]
		if a4 then
			e.ipv4 = a4.address
			e.mask = a4.mask
		end

		local sim = (name == "wan" or name == "wan6")
		e.sim = sim
		e.parked = sim and parked and not e.up
		e.in_use = e.up and ((active == "isp" and name == "isp")
			or (active ~= "isp" and sim))

		if e.in_use then e.state = "In use"
		elseif e.parked then e.state = "Parked"
		elseif e.up then e.state = "Standby"
		else e.state = "Down" end

		out[#out + 1] = e
	end

	return out
end

local function wan_status()
	local jsonc = require "luci.jsonc"
	local sys = require "luci.sys"
	local status = wan_status_file()
	-- the active uplink is picked by /usr/sbin/wan-failover (wired WAN first);
	-- fall back to the default route when the watchdog has not written yet
	local active = status.active
	if not active then
		local def = sys.exec("ip -4 route show default 2>/dev/null") or ""
		active = (def:match("dev%s+(%S+)") == "eth1") and "isp" or "sim"
	end
	local iface, uplink, fallback = "wan", "5g", "ccmni1"
	if active == "isp" then
		iface, uplink, fallback = "isp", "wired", "eth1"
	end
	local st = jsonc.parse(sys.exec("ifstatus " .. iface .. " 2>/dev/null") or "") or {}
	local wan = {
		up = st.up == true,
		uplink = uplink,
		proto = st.proto or "",
		uptime = tonumber(st.uptime) or 0,
		device = st.l3_device or st.device or fallback,
		dns = st["dns-server"] or {},
		active = active,
		active_label = IFACE_LABELS[iface] or iface:upper(),
		ifaces = wan_interfaces(status, active)
	}

	local a4 = st["ipv4-address"] and st["ipv4-address"][1]
	if a4 then
		wan.ipv4 = a4.address
		wan.mask = a4.mask
	end

	local route = st.route and st.route[1]
	if route then wan.gateway = route.nexthop end

	local dev = wan.device:gsub("[^%w_%-%./]", "")
	local rx = readfile("/sys/class/net/" .. dev .. "/statistics/rx_bytes"):match("^(%d+)")
	local tx = readfile("/sys/class/net/" .. dev .. "/statistics/tx_bytes"):match("^(%d+)")
	if not rx then
		rx = readfile("/sys/class/net/eth1/statistics/rx_bytes"):match("^(%d+)")
		tx = readfile("/sys/class/net/eth1/statistics/tx_bytes"):match("^(%d+)")
	end
	wan.rx_bytes = tonumber(rx) or 0
	wan.tx_bytes = tonumber(tx) or 0

	return wan
end

-- Same sources as Parental → Devices & Activity: DHCP leases, ARP on both
-- bridges, and the bridge FDB for L2-only devices. The router's own MACs and
-- multicast entries are excluded, so both pages report one number.
local function lan_clients()
	local sys = require "luci.sys"
	local seen, n = {}, 0

	local function add(mac)
		if not mac then return end
		mac = mac:lower()
		if mac == "00:00:00:00:00:00" or mac == "ff:ff:ff:ff:ff:ff" then return end
		if mac:sub(1, 2) == "01" or mac:match("^34:19:4d") then return end
		if not seen[mac] then
			seen[mac] = true
			n = n + 1
		end
	end

	for line in readfile("/tmp/dhcp.leases"):gmatch("[^\n]+") do
		add(line:match("^%S+%s+(%S+)"))
	end

	local neigh = sys.exec("ip -4 neigh show dev br-lan 2>/dev/null; ip -4 neigh show dev br-guest 2>/dev/null") or ""
	for line in neigh:gmatch("[^\n]+") do
		add(line:match(".-lladdr%s+(%S+)"))
	end

	local fdb = sys.exec("bridge fdb show br br-lan 2>/dev/null; bridge fdb show br br-guest 2>/dev/null") or ""
	for line in fdb:gmatch("[^\n]+") do
		if not line:match(" self ") and not line:match(" permanent") then
			add(line:match("^(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)"))
		end
	end

	return { total = n }
end

local function wifi_status()
	local sys = require "luci.sys"
	local out, cur = {}, nil
	local txt = sys.exec("iwconfig 2>/dev/null") or ""

	for line in txt:gmatch("[^\n]+") do
		local iface = line:match("^(%S+)%s+.*ESSID:")
		if iface then
			cur = { dev = iface }
		end
		if cur then
			local ssid = line:match('ESSID:"([^"]*)"')
			if ssid then cur.ssid = ssid end
			local mode = line:match("Mode:(%S+)")
			if mode then cur.mode = mode end
			local ch = line:match("Channel=(%d+)")
			if ch then cur.channel = tonumber(ch) end

			if cur.mode and cur.channel and cur.ssid ~= nil then
				if cur.mode == "Master" and cur.ssid ~= "" then
					cur.band = (cur.channel > 14) and "5 GHz" or "2.4 GHz"
					out[#out + 1] = cur
				end
				cur = nil
			end
		end
	end

	return out
end

local function vpn_status()
	local sys = require "luci.sys"
	local now = os.time()
	local list = {}
	local ifs = sys.exec("wg show interfaces 2>/dev/null") or ""

	for name in ifs:gmatch("%S+") do
		if name:match("^[%w_%-%.]+$") then
			local hs = sys.exec("wg show " .. name .. " latest-handshakes 2>/dev/null") or ""
			local peers, latest = 0, 0
			for line in hs:gmatch("[^\n]+") do
				local t = tonumber(line:match("%s(%d+)%s*$") or "")
				if t then
					peers = peers + 1
					if t > latest then latest = t end
				end
			end

			local tr = sys.exec("wg show " .. name .. " transfer 2>/dev/null") or ""
			local rx, tx = 0, 0
			for line in tr:gmatch("[^\n]+") do
				local a, b = line:match("(%d+)%s+(%d+)%s*$")
				if a then
					rx = rx + tonumber(a)
					tx = tx + tonumber(b)
				end
			end

			list[#list + 1] = {
				name = name,
				peers = peers,
				latest = latest,
				up = (latest > 0 and (now - latest) < 180),
				rx_bytes = rx,
				tx_bytes = tx
			}
		end
	end

	return list
end

local function parental_status()
	local rules, blocked = 0, 0
	for _ in readfile("/etc/config/parental"):gmatch("config%s+device") do
		rules = rules + 1
	end
	for line in readfile("/tmp/parental.status"):gmatch("[^\n]+") do
		if line:match("|blocked|") then blocked = blocked + 1 end
	end
	return { rules = rules, blocked = blocked }
end

-- Uplink failover state, written by /usr/sbin/wan-failover every 10 s.
-- "since" is when the active path was promoted; the overview shows how long
-- the current uplink has held.
local function failover_status()
	local st = {}
	for line in readfile("/tmp/wanfailover.status"):gmatch("[^\n]+") do
		local k, v = line:match("^([%w_]+)=(.*)$")
		if k then st[k] = v end
	end

	local since = 0
	local y, mo, d, h, mi, s = (st.since or ""):match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
	if y then
		local ok, t = pcall(os.time, {
			year = tonumber(y), month = tonumber(mo), day = tonumber(d),
			hour = tonumber(h), min = tonumber(mi), sec = tonumber(s)
		})
		if ok and type(t) == "number" then since = t end
	end

	return {
		state = st.state or "",
		active = st.active or "",
		since = since,
		checks = tonumber(st.checks) or 0,
		fails = tonumber(st.fails) or 0,
		sim_parked = st.sim_parked == "1"
	}
end

-- Live split-tunnel state: handshake age, set size, table-100 route, rule counts.
function action_vpnstatus()
	local http = require "luci.http"
	local sys = require "luci.sys"
	local uci = require("luci.model.uci").cursor()
	local now = os.time()

	local hs = sys.exec("wg show wgvpn latest-handshakes 2>/dev/null") or ""
	local latest = 0
	for line in hs:gmatch("[^\n]+") do
		local t = tonumber(line:match("%s(%d+)%s*$") or "") or 0
		if t > latest then latest = t end
	end

	local members = tonumber(sys.exec("ipset list vpnset 2>/dev/null | grep -cE '^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+'") or "0") or 0
	local route = (sys.exec("ip route show table 100 2>/dev/null") or ""):match("default%s+dev%s+(%S+)")

	local function count(key)
		local v = uci:get("vpnsplit", "settings", key) or {}
		if type(v) == "string" then v = { v } end
		return #v
	end

	http.prepare_content("application/json")
	http.header("Cache-Control", "no-store")
	http.write_json({
		vpn = uci:get("vpnsplit", "settings", "vpn") or "wgvpn",
		handshake_age = latest > 0 and (now - latest) or -1,
		members = members,
		domains = count("domains"),
		ips = count("ips"),
		route = route or ""
	})
end

-- Thermal zones. This SoC exposes ~23 of them under /sys/class/thermal:
-- CPU cluster, GPU, SoC hotspot, PMIC rails, modem/RF, DRAM, crystal. A few
-- report a bogus -274 C when the probe is not wired, so anything below -40 C
-- is dropped rather than shown as a plausible reading. cooling_device
-- cur_state > 0 means something is actively being throttled.
-- Short RAM trend behind the Thermals sparkline and the "peak since boot"
-- figure. /usr/sbin/thermal-sampler appends one line per cron run (5 min), so
-- seven days fits in 80 kB of tmpfs. Values are returned as integer tenths.
local function thermal_trend(limit)
	local vals, n, peak, peak_at = {}, 0, 0, 0
	for line in readfile("/tmp/thermal.hist"):gmatch("[^\n]+") do
		local t, soc = line:match("^(%d+)%s+([%d%.]+)")
		if t and soc then
			soc = tonumber(soc) or 0
			n = n + 1
			if soc > peak then peak, peak_at = soc, tonumber(t) end
			vals[n] = math.floor(soc * 10 + 0.5)
		end
	end
	local out, from = {}, n - limit + 1
	if from < 1 then from = 1 end
	for i = from, n do out[#out + 1] = vals[i] end
	return out, math.floor(peak * 10 + 0.5), peak_at, n
end

local function thermal_status()
	local fs = require "nixio.fs"
	local list, hottest = {}, nil

	for z in fs.glob("/sys/class/thermal/thermal_zone*") do
		local raw = (readfile(z .. "/temp") or ""):match("^%s*(-?%d+)")
		local name = (readfile(z .. "/type") or ""):gsub("%s+$", "")
		local t = tonumber(raw)
		if t and name ~= "" and t > -40000 then
			-- tenths of a degree: 45241 -> 452 (45.2 C). Kept as an integer so
			-- the JSON has no float noise; the browser divides by 10.
			local c = math.floor(t / 100)
			list[#list + 1] = {
				name = name,
				c = c,
				id = tonumber(z:match("(%d+)$")) or 0
			}
			if not hottest or c > hottest then hottest = c end
		end
	end

	table.sort(list, function(a, b) return a.id < b.id end)

	local cooling = 0
	for d in fs.glob("/sys/class/thermal/cooling_device*") do
		local st = tonumber((readfile(d .. "/cur_state") or ""):match("^%s*(%d+)"))
		if st and st > 0 then cooling = cooling + 1 end
	end

	local hist, peak, peak_at, samples = thermal_trend(72)

	return {
		sensors = list,
		max = hottest or 0,
		cooling = cooling,
		hist = hist,          -- last 72 samples, tenths
		peak = peak,          -- since boot, tenths
		peak_at = peak_at,
		samples = samples
	}
end

function action_vitals()
	local http = require "luci.http"
	local util = require "luci.util"
	local fs = require "nixio.fs"
	local board = util.ubus("system", "board") or {}
	local boardinfo = util.ubus("system", "info") or {}

	local rel = readfile("/etc/openwrt_release")
	local fw = rel:match("DISTRIB_DESCRIPTION='([^']*)'") or "OpenWrt"

	http.prepare_content("application/json")
	http.header("Cache-Control", "no-store")

	http.write_json({
		hostname = board.hostname or "Router",
		model = board.model or "",
		firmware = fw,
		kernel = boardinfo.kernelversion or "",
		uptime = uptime(),
		load = loadavg(),
		cpu = cpu_usage(),
		mem = meminfo(),
		wan = wan_status(),
		failover = failover_status(),
		clients = lan_clients(),
		wifi = wifi_status(),
		vpn = vpn_status(),
		parental = parental_status(),
		thermal = thermal_status()
	})
end
