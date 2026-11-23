module("luci.controller.ifstats", package.seeall)

function index()
	entry({"admin", "network", "ifstats"}, call("action_stats"), nil).leaf = true
end

local function read_prev()
	local prev = {}
	local fs = require "nixio.fs"
	local pf = fs.readfile("/tmp/ifstats.prev") or ""
	for line in pf:gmatch("[^\n]+") do
		local n, rx, tx, t = line:match("^(%S+)|(%d+)|(%d+)|(%d+)$")
		if n then
			prev[n] = { rx = tonumber(rx), tx = tonumber(tx), t = tonumber(t) }
		end
	end
	return prev
end

local function add_rate(e, prev, now)
	local p = prev[e.name]
	if p and now > p.t then
		e.rxrate = math.max(0, (e.rx - p.rx) * 8 / (now - p.t))
		e.txrate = math.max(0, (e.tx - p.tx) * 8 / (now - p.t))
	end
end

local function ipnum(ip)
	local a, b, c, d = ip:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
	if not a then return 0 end
	return tonumber(a) * 16777216 + tonumber(b) * 65536 + tonumber(c) * 256 + tonumber(d)
end

-- ARP entries + bridge FDB give IP -> interface where the kernel knows it.
-- Wired clients all appear on eth0 (single switch CPU port), so they cannot
-- be split between LAN1-LAN4 without reading the switch ARL table.
local function read_devices()
	local fs  = require "nixio.fs"
	local sys = require "luci.sys"

	local fdb_dev = {}
	local fdb = sys.exec("bridge fdb show br br-lan 2>/dev/null") or ""
	for line in fdb:gmatch("[^\n]+") do
		local mac, dev = line:match("^(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x) dev (%S+)")
		if mac and dev ~= "br-lan" and not line:match(" self ") then
			fdb_dev[mac:lower()] = dev
		end
	end

	local hosts = {}
	local leases = fs.readfile("/tmp/dhcp.leases") or ""
	for line in leases:gmatch("[^\n]+") do
		local _, mac, _, host = line:match("^(%S+) (%S+) (%S+) (%S+)")
		if mac and host ~= "*" then
			hosts[mac:lower()] = host
		end
	end

	local arp = {}
	local txt = fs.readfile("/proc/net/arp") or ""
	for line in txt:gmatch("[^\n]+") do
		local ip, _, _, mac = line:match("^(%d+%.%d+%.%d+%.%d+)%s+(%S+)%s+(%S+)%s+(%S+)")
		if ip and mac and mac ~= "00:00:00:00:00:00" then
			local m = mac:lower()
			arp[#arp + 1] = { ip = ip, mac = m, dev = fdb_dev[m] or "", host = hosts[m] or "" }
		end
	end

	table.sort(arp, function(x, y) return ipnum(x.ip) < ipnum(y.ip) end)
	return arp
end

local function ips_for(arp, dev)
	local t = {}
	for _, a in ipairs(arp) do
		if a.dev == dev then
			t[#t + 1] = a
		end
	end
	return t
end

-- Per-port counters from the MT7531 switch (MIB includes byte counters).
local function read_switch_ports()
	local sys = require "luci.sys"
	local txt = sys.exec("swconfig dev switch0 show 2>/dev/null") or ""
	local ports, cur = {}, nil

	for line in txt:gmatch("[^\n]+") do
		local p = line:match("^Port (%d+):")
		if p then
			cur = tonumber(p)
			ports[cur] = {}
		elseif cur then
			local rx = line:match("^%s*RxByte%s*:%s*(%d+)")
			local tx = line:match("^%s*TxByte%s*:%s*(%d+)")
			if rx then ports[cur].rx = tonumber(rx) end
			if tx then ports[cur].tx = tonumber(tx) end

			local st = line:match("link:%s*port:%d+%s+link:(%a+)")
			if st then
				ports[cur].state = st
			end

			local sp = line:match("speed:(%d+)baseT")
			if sp then ports[cur].speed = sp end

			local dx = line:match("(%a+)-duplex")
			if dx then ports[cur].duplex = dx end
		end
	end

	return ports
end

function action_stats()
	local http = require "luci.http"
	local fs   = require "nixio.fs"

	local prev = read_prev()
	local now  = os.time()
	local out, lines = {}, {}

	local arp = read_devices()

	local sw = read_switch_ports()
	local have_switch = (sw[0] ~= nil and sw[0].rx ~= nil)

	if have_switch then
		for p = 0, 3 do
			local sp = sw[p] or {}
			local e = {
				name   = "LAN" .. (p + 1),
				state  = sp.state or "down",
				speed  = sp.speed or "",
				mac    = "",
				duplex = sp.duplex or "",
				rx     = sp.rx or 0,
				tx     = sp.tx or 0,
				rxrate = 0,
				txrate = 0
			}
			add_rate(e, prev, now)
			out[#out + 1] = e
			lines[#lines + 1] = e.name .. "|" .. e.rx .. "|" .. e.tx .. "|" .. now
		end
	end

	-- Additional physical netdevs: wireless radios, USB tethering.
	local iter = fs.dir("/sys/class/net/br-lan/brif")
	if iter then
		for dev in iter do
			local skip = (dev == "eth0" and have_switch)

			if not skip then
				local base = "/sys/class/net/" .. dev
				local function rd(f)
					local v = fs.readfile(base .. "/" .. f) or ""
					return (v:gsub("%s+$", ""))
				end

				local e = {
					name   = dev,
					state  = rd("operstate"),
					speed  = rd("speed"),
					mac    = rd("address"),
					duplex = rd("duplex"),
					rx     = tonumber(rd("statistics/rx_bytes")) or 0,
					tx     = tonumber(rd("statistics/tx_bytes")) or 0,
					rxrate = 0,
					txrate = 0,
					ips    = ips_for(arp, dev)
				}
				add_rate(e, prev, now)
				out[#out + 1] = e
				lines[#lines + 1] = e.name .. "|" .. e.rx .. "|" .. e.tx .. "|" .. now
			end
		end
	end

	table.sort(out, function(a, b) return a.name < b.name end)
	fs.writefile("/tmp/ifstats.prev", table.concat(lines, "\n") .. "\n")

	http.prepare_content("application/json")
	http.write_json(out)
end
