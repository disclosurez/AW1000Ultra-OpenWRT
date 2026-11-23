#!/usr/bin/env lua
-- siem-send.lua — UDP/TCP datagram and stream sender for siem-forward.
--
--   lua siem-send.lua udp <host> <port> <file> [timeout]
--   lua siem-send.lua tcp <host> <port> <file> [timeout]
--
-- UDP sends one datagram per line in <file> (the forwarder writes one RFC5424
-- message per line), so messages are never split by a read-buffer boundary.
-- TCP sends the whole file and closes, which ends the stream cleanly.
-- Nixio ships with LuCI; using it avoids BusyBox nc's "wait for a reply"
-- behaviour on UDP (which stalls the flush loop) and keeps writes atomic.

local proto, host, port, path, timeout = ...
if not (proto and host and port and path) then
	io.stderr:write("usage: siem-send.lua udp|tcp <host> <port> <file> [timeout]\n")
	os.exit(2)
end

local ok, nixio = pcall(require, "nixio")
if not ok then
	io.stderr:write("nixio unavailable: " .. tostring(nixio) .. "\n")
	os.exit(3)
end

local portn = tonumber(port)
if not portn then
	io.stderr:write("bad port: " .. tostring(port) .. "\n")
	os.exit(2)
end

local fh, ferr = io.open(path, "rb")
if not fh then
	io.stderr:write("open " .. path .. ": " .. tostring(ferr) .. "\n")
	os.exit(1)
end
local data = fh:read("*a") or ""
fh:close()

-- Accept bracketed IPv6 literals from UCI.
if host:sub(1, 1) == "[" and host:sub(-1) == "]" then
	host = host:sub(2, -2)
end

local function set_timeout(sock)
	local n = tonumber(timeout) or 15
	pcall(function() sock:settimeout(n) end)
end

local function resolve(socktype)
	local ai = nixio.getaddrinfo(host, "any", port)
	if not ai then return nil end
	-- getaddrinfo returns an array; some versions return a bare table.
	local candidates = (ai[1] ~= nil) and ai or { ai }
	for _, a in ipairs(candidates) do
		if a.address and (a.family == "inet" or a.family == "inet6")
		   and (a.socktype == nil or a.socktype == socktype) then
			return a.address, a.family
		end
	end
	return nil
end

if proto == "udp" then
	local addr, family = resolve("dgram")
	if not addr then
		io.stderr:write("cannot resolve " .. host .. " (UDP)\n")
		os.exit(1)
	end

	local sock, serr = nixio.socket(family, "dgram")
	if not sock then
		io.stderr:write("socket: " .. tostring(serr) .. "\n")
		os.exit(1)
	end
	set_timeout(sock)

	for line in data:gmatch("[^\n]+") do
		if line ~= "" then
			local n, err = sock:sendto(line, addr, portn)
			if not n or n < #line then
				sock:close()
				io.stderr:write("sendto: " .. tostring(err or "short write") .. "\n")
				os.exit(1)
			end
		end
	end
	sock:close()
else
	local addr, family = resolve("stream")
	if not addr then
		io.stderr:write("cannot resolve " .. host .. " (TCP)\n")
		os.exit(1)
	end
	local sock, serr = nixio.socket(family, "stream")
	if not sock then
		io.stderr:write("socket: " .. tostring(serr) .. "\n")
		os.exit(1)
	end
	set_timeout(sock)
	local ok, cerr = sock:connect(addr, portn)
	if not ok then
		sock:close()
		io.stderr:write("connect " .. host .. ": " .. tostring(cerr) .. "\n")
		os.exit(1)
	end

	local off = 0
	while off < #data do
		local n, err = sock:send(data, off)
		if not n or n <= 0 then
			sock:close()
			io.stderr:write("send: " .. tostring(err) .. "\n")
			os.exit(1)
		end
		off = off + n
	end
	sock:close()
end

os.exit(0)
