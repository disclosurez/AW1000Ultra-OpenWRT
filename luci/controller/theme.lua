module("luci.controller.theme", package.seeall)

-- Theme switcher: flip LuCI between the AW1000 Console theme and the stock
-- Bootstrap theme. The page renders with whichever theme is active, so it can
-- be reached from either one (System → Theme), and the console topbar links
-- to it directly.

local THEMES = {
	console   = "/luci-static/console",
	bootstrap = "/luci-static/bootstrap",
}

local function current_name()
	local uci = require "luci.model.uci".cursor()
	local base = uci:get("luci", "main", "mediaurlbase") or THEMES.bootstrap
	for name, path in pairs(THEMES) do
		if path == base then return name, path end
	end
	return "bootstrap", THEMES.bootstrap
end

function index()
	entry({"admin", "system", "theme"}, template("theme/switch"), _("Theme"), 45).dependent = false
	entry({"admin", "system", "theme", "set"}, call("action_set")).leaf = true
end

function action_set()
	local http = require "luci.http"
	local disp = require "luci.dispatcher"
	local uci  = require "luci.model.uci".cursor()

	if not disp.test_post_security() then return end

	local want = http.formvalue("theme")
	if THEMES[want] then
		uci:set("luci", "main", "mediaurlbase", THEMES[want])
		uci:commit("luci")
		-- the menu tree and page chrome differ per theme; drop the caches
		require("luci.sys").call("rm -rf /tmp/luci-modulecache >/dev/null 2>&1")
		http.redirect(disp.build_url("admin", "system", "theme") .. "?switched=" .. want)
	else
		http.redirect(disp.build_url("admin", "system", "theme"))
	end
end

-- used by the template
function theme_current()
	return current_name()
end
