#!/usr/bin/env python3
# Re-apply the local radio-restore patch to a fresh 3ginfo lockband.js.
#
# The page disables the modem RF (AT+CFUN=4) before changing the network
# preference / 5G mode and re-enables it (AT+CFUN=1) afterwards. If the
# re-enable step is skipped, the modem stays in flight mode: the software
# radio reads ON but there is no RF, so the SIM never registers. This patch
# makes the restore unconditional and adds it to the band-lock submit path.
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(here, 'lockband.js')
src = open(path).read()
changed = False

old_restart = "function restartRadio(status){dom.content(status,[_('Restarting radio...')]);return L.resolveDefault(fs.exec_direct(MODEM_STATUS,['--at_cmd','AT+CFUN=4']),'').then(function(){return delay(2000);}).then(function(){dom.content(status,[_('Re-enabling radio...')]);return L.resolveDefault(fs.exec_direct(MODEM_STATUS,['--at_cmd','AT+CFUN=1']),'');});}"
new_restart = "function restoreRadio(){return L.resolveDefault(fs.exec_direct(MODEM_STATUS,['--at_cmd','AT+CFUN=1']),'');}function restartRadio(status){dom.content(status,[_('Restarting radio...')]);return L.resolveDefault(fs.exec_direct(MODEM_STATUS,['--at_cmd','AT+CFUN=4']),'').then(function(){return delay(2000);}).then(function(){dom.content(status,[_('Re-enabling radio...')]);return restoreRadio();},function(){return restoreRadio();});}"

if 'function restoreRadio()' in src:
    print('radio restore: already patched')
else:
    if src.count(old_restart) != 1:
        print('restartRadio anchor count:', src.count(old_restart))
        sys.exit(1)
    src = src.replace(old_restart, new_restart, 1)
    changed = True
    print('restartRadio: patched')

anchor = "--set_bandlock',arg]"
old_fin = ".finally(function(){button.removeAttribute('disabled');});"
new_fin = ".finally(function(){button.removeAttribute('disabled');return restoreRadio();});"

if anchor not in src:
    print('bandlock anchor missing')
    sys.exit(1)

i = src.index(anchor)
j = src.index(".finally(", i)
if 'restoreRadio' in src[j:j + 300]:
    print('bandlock finally: already patched')
else:
    if src[j:j + len(old_fin)] != old_fin:
        print('unexpected bandlock finally shape')
        sys.exit(1)
    src = src[:j] + new_fin + src[j + len(old_fin):]
    changed = True
    print('bandlock finally: patched')

if changed:
    open(path, 'w').write(src)
