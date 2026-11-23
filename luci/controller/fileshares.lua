module("luci.controller.fileshares", package.seeall)

-- SMB/CIFS file shares (Network -> File Shares).
-- Talks to remote shares with smbclient (samba4-client); nothing is mounted,
-- so no kernel module and no root filesystem writes are involved.
-- Share list: /etc/config/fileshares. Passwords: /etc/fileshares.secrets (0600).

function index()
	entry({"admin", "tools", "fileshares"}, template("fileshares/overview"), _("File Shares"), 20).dependent = false
	entry({"admin", "tools", "fileshares", "list"}, call("action_list")).leaf = true
	entry({"admin", "tools", "fileshares", "upload"}, call("action_upload")).leaf = true
	entry({"admin", "tools", "fileshares", "download"}, call("action_download")).leaf = true
	entry({"admin", "tools", "fileshares", "mkdir"}, call("action_mkdir")).leaf = true
	entry({"admin", "tools", "fileshares", "delete"}, call("action_delete")).leaf = true
	entry({"admin", "tools", "fileshares", "test"}, call("action_test")).leaf = true
	entry({"admin", "tools", "fileshares", "save"}, call("action_save")).leaf = true
	entry({"admin", "tools", "fileshares", "status"}, call("action_status")).leaf = true
	entry({"admin", "tools", "fileshares", "local_list"}, call("action_local_list")).leaf = true
	entry({"admin", "tools", "fileshares", "local_upload"}, call("action_local_upload")).leaf = true
	entry({"admin", "tools", "fileshares", "local_download"}, call("action_local_download")).leaf = true
	entry({"admin", "tools", "fileshares", "local_delete"}, call("action_local_delete")).leaf = true
end

local SECRETS = "/etc/fileshares.secrets"
local STAGE = "/data/fileshares"
local LOCAL_DIR = "/data/files"
local MAX_UPLOAD = 100 * 1024 * 1024          -- per file
local LOCAL_TOTAL_MAX = 1024 * 1024 * 1024    -- router storage budget

local function trim(s)
	s = (s or ""):gsub("^%s+", "")
	return (s:gsub("%s+$", ""))
end

local function shellq(s)
	return "'" .. (s or ""):gsub("'", "'\\''") .. "'"
end

local function fs()
	return require "nixio.fs"
end

local function dir_size(dir)
	local f, total = fs(), 0
	if not f.stat(dir) then return 0 end
	for name in f.dir(dir) do
		if name ~= "." and name ~= ".." then
			local st = f.stat(dir .. "/" .. name)
			if st and st.type == "reg" then total = total + (st.size or 0) end
		end
	end
	return total
end

-- A stored file name only: no slashes, no control chars, bounded length.
local function local_name(n)
	n = trim(n)
	n = n:gsub("[%z\1-\31]", ""):gsub("[/\\]", "_")
	if n == "" or n == "." or n == ".." then return nil end
	if #n > 160 then n = n:sub(-160) end
	return n
end

local function local_path(n)
	return LOCAL_DIR .. "/" .. n
end

local function sys()
	return require "luci.sys"
end

local function uci()
	return require("luci.model.uci").cursor()
end

local function http()
	return require "luci.http"
end

local function bad_request(code, msg)
	local h = http()
	h.prepare_content("application/json")
	h.write_json({ ok = false, code = code, error = msg })
end

local function authed()
	local h = http()
	local disp = require "luci.dispatcher"
	local token = h.formvalue("token") or h.formvalue("token")
	return token ~= nil and token == (disp.context.authtoken or "")
end

-- SMB names travel inside one -c string and one -D argument. Refuse anything
-- that could break out of the quotes or the SMB command language.
local function safe_name(s)
	if not s or s == "" or #s > 255 then return false end
	if s:find('[\r\n"\\]') then return false end
	if s == "." or s == ".." then return false end
	return true
end

local function safe_path(s)
	if s == nil or s == "" then return "/" end
	if #s > 1024 or s:find('[\r\n"\\]') then return false end
	return s
end

------------------------------------------------------------------ secrets

local function read_secret(section)
	local data = fs().readfile(SECRETS) or ""
	for line in data:gmatch("[^\n]+") do
		local k, v = line:match("^([^=]+)=(.*)$")
		if k == section then return v end
	end
	return ""
end

local function write_secret(section, value)
	local data = fs().readfile(SECRETS) or ""
	local out, done = {}, false
	for line in data:gmatch("[^\n]+") do
		local k = line:match("^([^=]+)=")
		if k == section then
			if value and value ~= "" then out[#out + 1] = section .. "=" .. value end
			done = true
		else
			out[#out + 1] = line
		end
	end
	if not done and value and value ~= "" then out[#out + 1] = section .. "=" .. value end
	fs().writefile(SECRETS, table.concat(out, "\n") .. (#out > 0 and "\n" or ""))
	fs().chmod(SECRETS, "0600")
end

--------------------------------------------------------------------- shares

local function get_share(id)
	local c = uci()
	if not id or not id:match("^[%w_]+$") then return nil end
	local s = c:get_all("fileshares", id)
	if not s or s[".type"] ~= "share" then return nil end
	if not s.host or not s.share then return nil end
	return s
end

local function share_list()
	local c = uci()
	local out = {}
	c:foreach("fileshares", "share", function(s)
		out[#out + 1] = {
			id = s[".name"],
			label = s.label or s.share,
			host = s.host,
			share = s.share,
			port = tonumber(s.port) or 445,
			user = s.user or "",
			domain = s.domain or "",
			guest = (s.guest == "1"),
			has_password = read_secret(s[".name"]) ~= ""
		}
	end)
	return out
end

-- Writes a throwaway auth file and returns its path (caller deletes it).
local function auth_file(s)
	local tmp = "/tmp/fsx-auth-" .. tostring(math.random(1e8))
	local body = {
		"username = " .. (s.user or ""),
		"password = " .. read_secret(s[".name"]),
		"domain = " .. ((s.domain ~= "" and s.domain) or "WORKGROUP")
	}
	fs().writefile(tmp, table.concat(body, "\n") .. "\n")
	fs().chmod(tmp, "0600")
	return tmp
end

-- Runs smbclient for one share and returns stdout/stderr and the exit code.
local function smb(s, dir, command)
	local auth = auth_file(s)
	local parts = {
		"timeout", "60", "smbclient", shellq("//" .. s.host .. "/" .. s.share),
		"-p", tostring(tonumber(s.port) or 445),
		"-s", "/dev/null"
	}
	if s.guest == "1" then
		parts[#parts + 1] = "-N"
		parts[#parts + 1] = "-U"
		parts[#parts + 1] = shellq("guest")
	else
		parts[#parts + 1] = "-A"
		parts[#parts + 1] = shellq(auth)
	end
	parts[#parts + 1] = "-D"
	parts[#parts + 1] = shellq(dir or "/")
	parts[#parts + 1] = "-c"
	parts[#parts + 1] = shellq(command)

	local out = sys().exec(table.concat(parts, " ") .. " 2>&1; echo __RC=$?") or ""
	fs().remove(auth)
	local rc = tonumber(out:match("__RC=(%-?%d+)")) or 1
	out = out:gsub("__RC=%-?%d+%s*$", "")
	return out, rc
end

-- Parses `smbclient ls` output. Lines look like:
--   "  name.txt                        N       12  Fri Nov 20 09:16:10 2026"
local function parse_ls(out)
	local entries = {}
	for line in (out or ""):gmatch("[^\n]+") do
		local name, attrs, size, date = line:match("^%s*(.-)%s+([ADHNR]+)%s+(%d+)%s+(%a%a%a%s+%a%a%a%s+%d+%s+%d+:%d+:%d+%s+%d%d%d%d)%s*$")
		if name and name ~= "." and name ~= ".." and name ~= "" then
			entries[#entries + 1] = {
				name = name,
				dir = attrs:find("D") ~= nil,
				size = tonumber(size) or 0,
				mtime = date
			}
		end
	end
	return entries
end

-- Turns smbclient output into something a person can act on.
local function explain(out)
	local o = (out or "")
	if o:find("NT_STATUS_LOGON_FAILURE") or o:find("NT_STATUS_WRONG_PASSWORD") then
		return "login", "The server rejected the username or password. SMB passwords are separate from the SSH/web login — on a Samba server set one with: smbpasswd -a <user>"
	end
	if o:find("NT_STATUS_ACCOUNT_DISABLED") or o:find("NT_STATUS_ACCOUNT_LOCKED_OUT") then
		return "login", "The account is disabled or locked out on the server."
	end
	if o:find("NT_STATUS_ACCESS_DENIED") then
		return "login", "Access denied. The credentials are valid but this user may not use this share."
	end
	if o:find("NT_STATUS_BAD_NETWORK_NAME") then
		return "share", "Connected, but the server has no share with that name. Check the share name (case-insensitive, no slashes)."
	end
	if o:find("NT_STATUS_HOST_UNREACHABLE") or o:find("No route to host") then
		return "net", "The router cannot reach that host. Check the IP address and that the device is on the LAN."
	end
	if o:find("Connection refused") or o:find("NT_STATUS_CONNECTION_REFUSED") then
		return "net", "Nothing is listening on that host and port. SMB is usually 445 (or 139 on old servers)."
	end
	if o:find("timed out") or o:find("Connection timed out") then
		return "net", "The connection timed out — host unreachable or a firewall is dropping port 445."
	end
	if o:find("protocol negotiation failed") or o:find("NT_STATUS_NOT_SUPPORTED") then
		return "proto", "Protocol mismatch. The server may be SMB1-only; enable SMB2 on the server or use an older client."
	end
	if o:find("NT_STATUS_IO_TIMEOUT") then
		return "net", "The server accepted the connection but stopped responding."
	end
	return "error", trim(o)
end

local function json(t)
	local h = http()
	h.prepare_content("application/json")
	h.header("Cache-Control", "no-store")
	h.write_json(t)
end

-- Query-string lookup that never parses the request body. Uploads send the
-- file as the raw body, so touching formvalue() first would consume it.
local function urldecode(v)
	v = (v or ""):gsub("+", " ")
	return (v:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end))
end

local function query_param(name)
	local q = http().getenv("QUERY_STRING") or ""
	for k, v in q:gmatch("([^&=]+)=([^&]*)") do
		if k == name then return urldecode(v) end
	end
	return nil
end

------------------------------------------------------------------- local storage

function action_local_list()
	local h = http()
	if not authed() then return bad_request(403, "token") end
	fs().mkdirr(LOCAL_DIR)
	local entries, used = {}, 0
	for name in fs().dir(LOCAL_DIR) do
		if name ~= "." and name ~= ".." then
			local st = fs().stat(local_path(name))
			if st and st.type == "reg" then
				entries[#entries + 1] = { name = name, size = st.size or 0, mtime = os.date("%Y-%m-%d %H:%M", st.mtime or 0) }
				used = used + (st.size or 0)
			end
		end
	end
	table.sort(entries, function(a, b) return a.name:lower() < b.name:lower() end)
	json({ ok = true, entries = entries, used = used, max = LOCAL_TOTAL_MAX })
end

function action_local_upload()
	local h = http()
	local tok = query_param("token")
	local disp = require "luci.dispatcher"
	if tok == nil or tok ~= (disp.context.authtoken or "") then
		return bad_request(403, "token")
	end

	local name = local_name(query_param("name"))
	if not name then return bad_request(400, "bad file name") end

	-- CONTENT_LENGTH covers the whole multipart envelope, so allow 1 MB of
	-- boundaries/headers on top of the 100 MB file limit.
	local declared = tonumber(h.getenv("CONTENT_LENGTH") or 0) or 0
	if declared > MAX_UPLOAD + 1048576 then
		return bad_request(413, "file is larger than 100 MB")
	end

	fs().mkdirr(LOCAL_DIR)
	fs().mkdirr(STAGE)
	local used = dir_size(LOCAL_DIR)
	if used + declared > LOCAL_TOTAL_MAX then
		return bad_request(507, string.format("router storage is full (%d MB of 1024 MB used)", math.floor(used / 1048576)))
	end

	local tmp = STAGE .. "/local-" .. tostring(os.time()) .. "-" .. tostring(math.random(1e6))
	local fh, total = nil, 0
	local too_big = false
	h.setfilehandler(function(meta, chunk, eof)
		if not fh then fh = io.open(tmp, "wb"); if not fh then return end end
		if chunk and chunk ~= "" then
			total = total + #chunk
			if total > MAX_UPLOAD then too_big = true else fh:write(chunk) end
		end
		if eof and fh then fh:close(); fh = nil end
	end)
	h.formvalue("file")
	if fh then fh:close() end

	if too_big then
		fs().remove(tmp)
		return bad_request(413, "file is larger than 100 MB")
	end
	if total == 0 then
		fs().remove(tmp)
		return bad_request(400, "empty upload")
	end
	if used + total > LOCAL_TOTAL_MAX then
		fs().remove(tmp)
		return bad_request(507, "router storage is full (1 GB)")
	end

	-- Never overwrite silently.
	local target = local_path(name)
	if fs().access(target) then
		local base, ext = name:match("^(.+)(%.[^%.]+)$")
		if not base then base, ext = name, "" end
		for i = 1, 99 do
			local cand = base .. "-" .. i .. ext
			if not fs().access(local_path(cand)) then target = local_path(cand) break end
		end
	end

	local ok, err = fs().rename(tmp, target)
	if not ok then
		-- rename is not always atomic across the same fs; fall back to copy
		local data = fs().readfile(tmp)
		if data then fs().writefile(target, data); fs().remove(tmp); ok = true end
	end
	if not ok then fs().remove(tmp); return bad_request(500, "could not store the file") end

	json({ ok = true, name = (target:match("/([^/]+)$") or name), size = total })
end

function action_local_download()
	local h = http()
	local name = local_name(h.formvalue("name"))
	if not name then return bad_request(400, "bad name") end
	local path = local_path(name)
	if not fs().access(path) then return bad_request(404, "no such file") end
	h.header("Content-Disposition", 'attachment; filename="' .. name .. '"')
	h.prepare_content("application/octet-stream")
	local fh = io.open(path, "rb")
	if not fh then return end
	while true do
		local chunk = fh:read(65536)
		if not chunk then break end
		h.write(chunk)
	end
	fh:close()
end

function action_local_delete()
	local h = http()
	if not authed() then return bad_request(403, "token") end
	local name = local_name(h.formvalue("name"))
	if not name then return bad_request(400, "bad name") end
	if not fs().access(local_path(name)) then return bad_request(404, "no such file") end
	fs().remove(local_path(name))
	json({ ok = true })
end

------------------------------------------------------------------- actions

function action_status()
	local out = { ok = true, shares = share_list() }
	local bin = fs().access("/usr/bin/smbclient") or fs().access("/usr/sbin/smbclient")
	out.smbclient = bin and true or false
	json(out)
end

function action_test()
	local h = http()
	local s = get_share(h.formvalue("id"))
	if not s then return bad_request(404, "unknown share") end
	local out, rc = smb(s, "/", "ls")
	if rc == 0 then
		json({ ok = true, output = trim(out) })
	else
		local kind, msg = explain(out)
		json({ ok = false, kind = kind, error = msg, output = trim(out) })
	end
end

function action_list()
	local h = http()
	if not authed() then return bad_request(403, "token") end
	local s = get_share(h.formvalue("id"))
	if not s then return bad_request(404, "unknown share") end
	local path = h.formvalue("path") or "/"
	if not safe_path(path) then return bad_request(400, "bad path") end

	local out, rc = smb(s, path, "ls")
	if rc ~= 0 then
		local kind, msg = explain(out)
		return json({ ok = false, kind = kind, error = msg, detail = trim(out), path = path })
	end
	local entries = parse_ls(out)
	table.sort(entries, function(a, b)
		if a.dir ~= b.dir then return a.dir end
		return a.name:lower() < b.name:lower()
	end)
	json({ ok = true, path = path, entries = entries })
end

function action_upload()
	local h = http()
	local tok = query_param("token")
	local disp = require "luci.dispatcher"
	if tok == nil or tok ~= (disp.context.authtoken or "") then
		return bad_request(403, "token")
	end
	local s = get_share(query_param("id"))
	if not s then return bad_request(404, "unknown share") end
	local path = query_param("path") or "/"
	local name = query_param("name") or ""
	if not safe_path(path) or not safe_name(name) then return bad_request(400, "bad target") end

	local work = STAGE
	fs().mkdirr(work)
	os.execute("find " .. work .. " -type f -mmin +60 -delete 2>/dev/null")
	local tmp = work .. "/upload-" .. tostring(os.time()) .. "-" .. tostring(math.random(1e6))
	local fh, total = nil, 0
	local too_big = false

	-- LuCI streams multipart parts through this callback; the file field is
	-- written straight to a temp file and never held in memory.
	h.setfilehandler(function(meta, chunk, eof)
		if not fh then
			fh = io.open(tmp, "wb")
			if not fh then return end
		end
		if chunk and chunk ~= "" then
			total = total + #chunk
			if total > MAX_UPLOAD then
				too_big = true
			else
				fh:write(chunk)
			end
		end
		if eof and fh then fh:close(); fh = nil end
	end)

	h.formvalue("file")   -- triggers the multipart parse (and the callback)
	if fh then fh:close() end

	if too_big then
		fs().remove(tmp)
		return bad_request(413, "file larger than 100 MB")
	end
	if total == 0 or not fs().access(tmp) then
		fs().remove(tmp)
		return bad_request(400, "empty upload")
	end

	local out, rc = smb(s, path, 'put "' .. tmp .. '" "' .. name .. '"')
	fs().remove(tmp)
	json({ ok = rc == 0, size = total, output = trim(out) })
end

function action_download()
	local h = http()
	local s = get_share(h.formvalue("id"))
	if not s then return bad_request(404, "unknown share") end
	local path = h.formvalue("path") or "/"
	local name = h.formvalue("name") or ""
	if not safe_path(path) or not safe_name(name) then return bad_request(400, "bad name") end

	local work = STAGE
	fs().mkdirr(work)
	os.execute("find " .. work .. " -type f -mmin +60 -delete 2>/dev/null")
	local tmp = work .. "/download-" .. tostring(os.time()) .. "-" .. tostring(math.random(1e6))

	local out, rc = smb(s, path, 'get "' .. name .. '" "' .. tmp .. '"')
	if rc ~= 0 or not fs().access(tmp) then
		fs().remove(tmp)
		return bad_request(502, "download failed: " .. trim(out))
	end

	h.header("Content-Disposition", 'attachment; filename="' .. name .. '"')
	h.prepare_content("application/octet-stream")
	local fh = io.open(tmp, "rb")
	fs().remove(tmp)
	if not fh then return end
	while true do
		local chunk = fh:read(65536)
		if not chunk then break end
		h.write(chunk)
	end
	fh:close()
end

function action_mkdir()
	local h = http()
	if not authed() then return bad_request(403, "token") end
	local s = get_share(h.formvalue("id"))
	if not s then return bad_request(404, "unknown share") end
	local path = h.formvalue("path") or "/"
	local name = h.formvalue("name") or ""
	if not safe_path(path) or not safe_name(name) then return bad_request(400, "bad name") end
	local out, rc = smb(s, path, 'mkdir "' .. name .. '"')
	json({ ok = rc == 0, output = trim(out) })
end

function action_delete()
	local h = http()
	if not authed() then return bad_request(403, "token") end
	local s = get_share(h.formvalue("id"))
	if not s then return bad_request(404, "unknown share") end
	local path = h.formvalue("path") or "/"
	local name = h.formvalue("name") or ""
	local isdir = h.formvalue("dir") == "1"
	if not safe_path(path) or not safe_name(name) then return bad_request(400, "bad name") end
	local cmd = isdir and ('rmdir "' .. name .. '"') or ('del "' .. name .. '"')
	local out, rc = smb(s, path, cmd)
	json({ ok = rc == 0, output = trim(out) })
end

function action_save()
	local h = http()
	local c = uci()
	local disp = require "luci.dispatcher"

	if h.formvalue("token") ~= (disp.context.authtoken or "") then
		h.redirect(disp.build_url("admin", "tools", "fileshares") .. "?error=1")
		return
	end

	local op = h.formvalue("op") or "save"
	local id = h.formvalue("id") or ""

	if op == "delete" then
		if id:match("^[%w_]+$") then
			c:delete("fileshares", id)
			c:commit("fileshares")
			write_secret(id, nil)
		end
		h.redirect(disp.build_url("admin", "tools", "fileshares") .. "?saved=1")
		return
	end

	local host = trim(h.formvalue("host"))
	local share = trim(h.formvalue("share"))
	local label = trim(h.formvalue("label"))
	local user = trim(h.formvalue("user"))
	local domain = trim(h.formvalue("domain"))
	local port = tonumber(h.formvalue("port")) or 445
	local guest = (h.formvalue("guest") == "1") and "1" or "0"
	local password = h.formvalue("password") or ""

	if host == "" or share == "" or not host:match("^[%w%._:%-]+$") or not share:match("^[^/\\]+$") then
		h.redirect(disp.build_url("admin", "tools", "fileshares") .. "?error=1")
		return
	end

	if id == "" or not id:match("^[%w_]+$") then
		id = c:add("fileshares", "share")
	end
	label = (label ~= "" and label) or share

	c:set("fileshares", id, "share")
	c:set("fileshares", id, "label", label)
	c:set("fileshares", id, "host", host)
	c:set("fileshares", id, "share", share)
	c:set("fileshares", id, "port", tostring(port))
	c:set("fileshares", id, "user", user)
	c:set("fileshares", id, "domain", domain)
	c:set("fileshares", id, "guest", guest)
	c:commit("fileshares")

	if password ~= "" then
		write_secret(id, password)
	elseif guest == "1" then
		write_secret(id, nil)
	end

	h.redirect(disp.build_url("admin", "tools", "fileshares") .. "?saved=1")
end
