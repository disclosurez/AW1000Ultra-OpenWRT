#!/usr/bin/env python3
import sys

p = '/root/openwrt/vendor/menu-bootstrap.js'
src = open(p).read()
old = '_(children[i].title)'
new = "_((children[i].title||'').replace(/&#(\\d+);/g,function(c,n){return String.fromCharCode(n)}))"

if 'String.fromCharCode(n)' in src:
    print('already patched')
    sys.exit(0)

n = src.count(old)
if n == 0:
    print('marker not found')
    sys.exit(1)

src = src.replace(old, new)
open(p, 'w').write(src)
print('patched', n, 'occurrences')
