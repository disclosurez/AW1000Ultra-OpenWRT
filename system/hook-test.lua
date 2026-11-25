local nixio = require "nixio"

local srv = nixio.socket("inet", "stream")
srv:setopt("socket", "reuseaddr", 1)
srv:bind("127.0.0.1", 8899)
srv:listen(1)

local cli = srv:accept()
local head = ""
while not head:find("\r\n\r\n") do
	local d = cli:read(1)
	if not d or #d == 0 then break end
	head = head .. d
end

local len = tonumber(head:match("[Cc]ontent%-[Ll]ength:%s*(%d+)")) or 0
local body = ""
while #body < len do
	local d = cli:read(len - #body)
	if not d or #d == 0 then break end
	body = body .. d
end

local f = io.open("/tmp/hook.body", "w")
f:write(head .. "\n---BODY---\n" .. body)
f:close()

cli:write("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
cli:close()
srv:close()
