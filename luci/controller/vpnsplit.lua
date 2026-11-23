module("luci.controller.vpnsplit", package.seeall)

function index()
	entry({"admin", "network", "vpnsplit"}, cbi("vpnsplit/domains"), _("VPN Split Tunnel"), 65)
end
