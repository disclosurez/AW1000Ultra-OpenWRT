module("luci.controller.leds", package.seeall)

-- System -> LEDs: live LED state and control.
--
-- The stock LED Configuration page edits netdev triggers that this kernel
-- does not provide, and the vendor led_ctrld rewrites the sysfs triggers
-- anyway. This page drives /usr/sbin/aw1000-led instead, which parks the
-- vendor daemon and maps the LEDs onto the real uplink state.

function index()
	entry({"admin", "system", "leds"}, template("leds/overview"), _("LEDs"), 46).dependent = false
	entry({"admin", "system", "leds", "save"}, call("action_save")).leaf = true
	entry({"admin", "system", "leds", "status"}, call("action_status")).leaf = true
end

local function trim(s)
	return (s or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function ctl(args)
	return trim(require("luci.sys").exec("/usr/sbin/aw1000-led " .. args .. " 2>/dev/null") or "")
end

local function led_state()
	local sys = require "luci.sys"
	local uci = require("luci.model.uci").cursor()
	local out = {}
	for _, led in ipairs({ "internet:single", "status:green", "status:red", "wifi:green", "signal:green" }) do
		local b = trim(sys.exec("cat '/sys/class/leds/" .. led .. "/brightness' 2>/dev/null") or "")
		local t = trim(sys.exec("cat '/sys/class/leds/" .. led .. "/trigger' 2>/dev/null | cut -d'[' -f2 | cut -d']' -f1") or "")
		out[#out + 1] = {
			name = led,
			brightness = tonumber(b) or 0,
			trigger = (t ~= "" and t) or "none",
		}
	end
	return out
end

function action_status()
	local http = require "luci.http"
	local running = (require("luci.sys").call("ps w | grep '[a]w1000-led daemon' >/dev/null 2>&1") == 0)
	http.prepare_content("application/json")
	http.write_json({
		running = running,
		leds = led_state(),
	})
end

function action_save()
	local http = require "luci.http"
	local disp = require "luci.dispatcher"
	local uci  = require("luci.model.uci").cursor()

	if not disp.test_post_security() then return end

	local enabled = (http.formvalue("enabled") == "1") and "1" or "0"
	local blink = (http.formvalue("blink_offline") == "1") and "1" or "0"
	local test_state = http.formvalue("test_state") or ""
	if test_state ~= "online" and test_state ~= "offline" then test_state = "" end

	local interval = tonumber(http.formvalue("interval") or 5) or 5
	if interval < 2 or interval > 300 or interval ~= math.floor(interval) then interval = 5 end

	uci:set("leds", "settings", "leds")
	uci:set("leds", "settings", "enabled", enabled)
	uci:set("leds", "settings", "blink_offline", blink)
	uci:set("leds", "settings", "interval", tostring(interval))
	uci:set("leds", "settings", "test_state", test_state)
	uci:commit("leds")

	-- restart applies the takeover/release and the new options
	require("luci.sys").call("/etc/init.d/aw1000led restart >/dev/null 2>&1")

	http.redirect(disp.build_url("admin", "system", "leds") .. "?saved=1")
end
