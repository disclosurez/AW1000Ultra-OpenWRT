module("luci.controller.notify", package.seeall)

-- System -> Notifications: Telegram bot and/or Discord webhook for the
-- uplink-switch alerts. Configuration lives in /etc/config/notify; the two
-- credentials live in their own 0600 files (never in UCI, never in argv).

local http = require "luci.http"
local fs = require "nixio.fs"
local disp = require "luci.dispatcher"
local uci = require("luci.model.uci").cursor()

local TG_FILE = "/etc/notify.telegram.token"
local DC_FILE = "/etc/notify.discord.webhook"

function index()
	entry({"admin", "system", "notifications"}, template("notify"),
		_("Notifications"), 55).dependent = false
	entry({"admin", "system", "notifications", "save"}, call("action_save")).leaf = true
	entry({"admin", "system", "notifications", "test"}, call("action_test")).leaf = true
end

local function authed()
	local t = http.formvalue("token")
	return t ~= nil and t == (disp.context.authtoken or "")
end

local function trim(s)
	s = (s or ""):gsub("^%s+", "")
	return (s:gsub("%s+$", ""))
end

-- An empty field means "leave the stored secret alone"; the checkbox sends "-".
local function store_secret(path, value)
	if value == nil then return end
	if value == "-" then
		fs.remove(path)
		return
	end
	value = trim(value)
	if value == "" then return end
	local tmp = path .. ".tmp"
	fs.writefile(tmp, value .. "\n")
	fs.chmod(tmp, 384) -- 0600
	fs.rename(tmp, path)
end

local function valid_webhook(url)
	return url:match("^https://") ~= nil
end

function action_save()
	if not authed() then
		http.status(403, "Forbidden")
		return
	end

	local provider = http.formvalue("provider") or "telegram"
	if provider ~= "telegram" and provider ~= "discord" and provider ~= "both" then
		provider = "telegram"
	end

	local mute = tonumber(http.formvalue("mute")) or 300
	if mute < 0 then mute = 0 end
	if mute > 86400 then mute = 86400 end

	uci:set("notify", "settings", "settings")
	uci:set("notify", "settings", "enabled",
		(http.formvalue("enabled") == "1") and "1" or "0")
	uci:set("notify", "settings", "provider", provider)
	uci:set("notify", "settings", "chat", (http.formvalue("chat") or ""):gsub("%s", ""))
	uci:set("notify", "settings", "mute", tostring(mute))
	uci:set("notify", "settings", "on_switch",
		(http.formvalue("on_switch") == "1") and "1" or "0")
	uci:set("notify", "settings", "on_heartbeat",
		(http.formvalue("on_heartbeat") == "1") and "1" or "0")
	uci:set("notify", "settings", "telegram_token_file", TG_FILE)
	uci:set("notify", "settings", "discord_webhook_file", DC_FILE)
	uci:commit("notify")

	local note = "saved"

	-- An empty field keeps the stored secret; the checkbox removes it.
	if http.formvalue("telegram_token_clear") == "1" then
		store_secret(TG_FILE, "-")
	else
		local tok = http.formvalue("telegram_token")
		if trim(tok or "") ~= "" then
			if tok:match("^%d+:") then
				store_secret(TG_FILE, tok)
			else
				note = "token-rejected"
			end
		end
	end

	if http.formvalue("discord_webhook_clear") == "1" then
		store_secret(DC_FILE, "-")
	else
		local hook = http.formvalue("discord_webhook")
		if trim(hook or "") ~= "" then
			if valid_webhook(trim(hook)) then
				store_secret(DC_FILE, hook)
			else
				note = "webhook-rejected"
			end
		end
	end

	http.redirect(disp.build_url("admin", "system", "notifications") .. "?" .. note .. "=1")
end

function action_test()
	if not authed() then
		http.status(403, "Forbidden")
		return
	end
	-- one attempt per provider; the cron/heartbeat path does the retries
	local out = luci.sys.exec("/usr/sbin/wan-notify test 2>&1")
	fs.writefile("/tmp/notify.test.out", out or "")
	http.redirect(disp.build_url("admin", "system", "notifications") .. "?tested=1")
end
