#!/usr/bin/env python3
import sys

p = '/root/openwrt/vendor/bootstrap-header.htm'
src = open(p).read()
old = "' - ' .. translate(node.title)"
new = "' - ' .. translate(node.title):gsub(\"&#(%d+);\", function(n) return string.char(tonumber(n)) end)"

if 'string.char(tonumber(n))' in src:
    print('already patched')
    sys.exit(0)

if src.count(old) != 1:
    print('marker count:', src.count(old))
    sys.exit(1)

open(p, 'w').write(src.replace(old, new, 1))
print('patched')
