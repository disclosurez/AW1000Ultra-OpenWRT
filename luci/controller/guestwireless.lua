module("luci.controller.guestwireless", package.seeall)

-- Guest Wi-Fi overview and on/off controls.
-- The guest SSID list is the same `wifi_guest.main.ifaces` list that the
-- vendor Wi-Fi Add/Edit form writes when "Guest network" is ticked.

function index()
	entry({"admin", "mtk", "guestwireless"}, firstchild(), _("Guest Wireless"), 3).dependent = false
	entry({"admin", "mtk", "guestwireless", "overview"}, template("guestwireless/overview"),
		_("Overview"), 1).leaf = true
	entry({"admin", "mtk", "guestwireless", "devices"}, template("guestwireless/devices"),
		_("Devices"), 2).leaf = true
	entry({"admin", "mtk", "guestwireless", "logs"}, template("guestwireless/logs"),
		_("Logs"), 3).leaf = true
	entry({"admin", "mtk", "guestwireless", "save"}, call("action_save")).leaf = true
	entry({"admin", "mtk", "guestwireless", "scan"}, call("action_scan")).leaf = true
	entry({"admin", "mtk", "guestwireless", "log"}, call("action_log")).leaf = true
end

function action_save()
	local http = require "luci.http"
	local uci  = require "luci.model.uci".cursor()
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"

	local enabled = (http.formvalue("enabled") == "1")
	local portal  = (http.formvalue("portal") == "1")

	uci:set("wifi_guest", "main", "enabled", enabled and "1" or "0")
	uci:set("captiveportal", "main", "enabled", portal and "1" or "0")
	uci:set("captiveportal", "main", "gate_iface", "br-guest")
	uci:commit("wifi_guest")
	uci:commit("captiveportal")

	-- Down/up the guest VIFs, then re-apply the portal for the new state.
	sys.call("/usr/sbin/wifi-guest reload >/dev/null 2>&1")
	sys.call("/etc/init.d/captiveportal restart >/dev/null 2>&1")

	http.redirect(disp.build_url("admin", "mtk", "guestwireless", "overview") .. "?saved=1")
end

function action_scan()
	local http = require "luci.http"
	local sys  = require "luci.sys"
	local disp = require "luci.dispatcher"

	sys.call("/usr/sbin/lan-scan >/dev/null 2>&1")
	http.redirect(disp.build_url("admin", "mtk", "guestwireless", "devices"))
end

function action_log()
	local http = require "luci.http"
	local fs   = require "nixio.fs"
	local uci  = require "luci.model.uci".cursor()

	local path = uci:get("captiveportal", "main", "log_file") or "/data/portal/accept.log"
	http.prepare_content("text/plain")
	if not fs.access(path) then
		http.write("No acceptances yet.\n")
		return
	end
	http.header("Content-Disposition", 'attachment; filename="captive-portal-accept.log"')
	http.write(fs.readfile(path) or "")
end
