local sys = require "luci.sys"
local uci = require "luci.model.uci".cursor()

local m, s, o

m = Map("vpnsplit", translate("VPN Split Tunnel"),
	translate("Choose which VPN carries the split tunnel, then list the domains and IP addresses/networks that should use it. Everything else keeps using your normal internet connection."))

s = m:section(TypedSection, "vpnsplit", translate("Settings"))
s.anonymous = true
s.addremove = false

-- VPN interface selector (WireGuard / OpenVPN interfaces detected automatically)
o = s:option(ListValue, "vpn", translate("VPN interface"),
	translate("Traffic for the entries below is routed through this interface."))
o.default = "wgvpn"
o.rmempty = false

local seen = {}
uci:foreach("network", "interface", function(sec)
	local name = sec[".name"]
	local proto = sec.proto
	local ifname = sec.ifname and tostring(sec.ifname) or ""

	if proto == "wireguard" or proto == "openvpn"
	   or name:match("^wg") or ifname:match("^tun") then
		o:value(name, proto and (name .. " (" .. proto .. ")") or name)
		seen[name] = true
	end
end)

local current = uci:get("vpnsplit", "settings", "vpn")
if current and not seen[current] then
	o:value(current, current)
end
if not seen["wgvpn"] then
	o:value("wgvpn", "wgvpn (wireguard)")
end

o = s:option(DynamicList, "domains", translate("Domains"),
	translate("Domains whose traffic should use the VPN. Subdomains are included automatically."))
o.datatype = "hostname"
o.rmempty = true

local function valid_net(self, value)
	local a, b, c, d, p

	a, b, c, d, p = value:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)/(%d+)$")
	if a then
		if tonumber(a) <= 255 and tonumber(b) <= 255 and tonumber(c) <= 255
		   and tonumber(d) <= 255 and tonumber(p) <= 32 then
			return value
		end
		return nil, translate("Invalid IPv4 network")
	end

	a, b, c, d = value:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
	if a and tonumber(a) <= 255 and tonumber(b) <= 255
	   and tonumber(c) <= 255 and tonumber(d) <= 255 then
		return value
	end

	return nil, translate("Enter an IPv4 address or CIDR, e.g. 203.0.113.5 or 203.0.113.0/24")
end

o = s:option(DynamicList, "ips", translate("IP addresses / networks"),
	translate("Individual IPv4 addresses or CIDR ranges that should always use the VPN, e.g. 203.0.113.5 or 203.0.113.0/24."))
o.rmempty = true
o.validate = valid_net

-- Rebuild rules as soon as the form is saved.
function m.commit_handler(self, state)
	sys.call("/etc/init.d/vpnsplit reload >/dev/null 2>&1")
end

function m.on_after_commit(self)
	sys.call("/etc/init.d/vpnsplit reload >/dev/null 2>&1")
end

return m
