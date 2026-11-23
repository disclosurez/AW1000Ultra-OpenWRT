#!/usr/bin/env python3
# Re-apply the local patches to a fresh vendor interfaces.js:
#   1. the "Physical Interfaces" tab (snippet from physical-tab.js)
#   2. interface display labels: wan -> SIM, wan6 -> SIM6, isp -> ISP
#   3. interface ordering: ISP, SIM/SIM6, other, WireGuard last
import sys

path = '/root/openwrt/vendor/interfaces.js'
anchor = "o.datatype='cidr6';"
snippet = open('/root/openwrt/vendor/physical-tab.js').read()
src = open(path).read()
changed = False

if 'Physical Interfaces' in src:
    print('physical tab: already patched')
else:
    if src.count(anchor) != 1:
        print('anchor count:', src.count(anchor))
        sys.exit(1)
    src = src.replace(anchor, anchor + '\n' + snippet, 1)
    changed = True
    print('physical tab: patched')

# --- display labels -------------------------------------------------------
label_ns = "var IFACE_LABELS={wan:'SIM',wan6:'SIM6',isp:'ISP'};" \
           "function ifaceLabel(n){return IFACE_LABELS[n]||n;}"
if 'IFACE_LABELS' in src:
    print('labels: already patched')
else:
    old = 'function count_changes(section_id){'
    if src.count(old) != 1:
        print('count_changes anchor count:', src.count(old))
        sys.exit(1)
    src = src.replace(old, label_ns + old, 1)
    changed = True
    print('labels: helper added')

# --- interface ordering ---------------------------------------------------
# Overview of the list: ISP, then SIM/SIM6, then everything else, WireGuard
# interfaces last. The rank is applied by cfgsections below.
order_ns = ("var IFACE_ORDER={isp:0,wan:1,wan6:2};"
            "function ifaceRank(n){if(IFACE_ORDER[n]!==undefined)return IFACE_ORDER[n];"
            "if(/^wg/i.test(n)||uci.get('network',n,'proto')=='wireguard')return 9;return 5;}")
if 'ifaceRank' in src:
    print('order: already patched')
else:
    old = 'function count_changes(section_id){'
    if src.count(old) != 1:
        print('count_changes order anchor count:', src.count(old))
        sys.exit(1)
    src = src.replace(old, order_ns + old, 1)
    changed = True
    print('order: helper added')

old = "s.cfgsections=function(){return this.networks.map(function(n){return n.getName()}).filter(function(n){return n!='loopback'});};"
new = ("s.cfgsections=function(){var names=this.networks.map(function(n){return n.getName()})"
       ".filter(function(n){return n!='loopback'});var idx={};names.forEach(function(n,i){idx[n]=i;});"
       "return names.sort(function(a,b){var d=ifaceRank(a)-ifaceRank(b);return d?d:idx[a]-idx[b];});};")
if 'ifaceRank(a)-ifaceRank(b)' in src:
    print('sort: already patched')
else:
    if src.count(old) != 1:
        print('cfgsections anchor count:', src.count(old))
        sys.exit(1)
    src = src.replace(old, new, 1)
    changed = True
    print('sort: patched')

# --- netifd STOPPED is not an error --------------------------------------
# The SIM is parked with `ifdown` on purpose; netifd reports code STOPPED and
# this LuCI's network.js has no message for it, so it renders as
# "Error: Unknown error (STOPPED)". Hide it and show "Parked" instead.
stopped_ns = ("function iface_stopped(ifc){var raw=(typeof ifc._ubus=='function')?ifc._ubus('errors'):null;"
              "if(Array.isArray(raw))for(var i=0;i<raw.length;i++)if(raw[i]&&raw[i].code=='STOPPED')return true;return false;}"
              "function iface_errors(ifc){var errs=ifc.getErrors(),raw=(typeof ifc._ubus=='function')?ifc._ubus('errors'):null,keep=[];"
              "if(!Array.isArray(raw)||!Array.isArray(errs)||raw.length!=errs.length)return errs;"
              "for(var i=0;i<raw.length;i++)if(!raw[i]||raw[i].code!='STOPPED')keep.push(errs[i]);"
              "return keep.length?keep:null;}")
if 'iface_stopped' in src:
    print('stopped: already patched')
else:
    old = 'function render_status(node,ifc,with_device){'
    if src.count(old) != 1:
        print('render_status anchor count:', src.count(old))
        sys.exit(1)
    src = src.replace(old, stopped_ns + old, 1)
    changed = True
    print('stopped: helpers added')

if 'iface_errors(ifc)' in src:
    print('errors filter: already patched')
else:
    old = 'errors=ifc.getErrors(),maindev='
    if src.count(old) != 1:
        print('errors anchor count:', src.count(old))
        sys.exit(1)
    src = src.replace(old, 'errors=iface_errors(ifc),stopped=iface_stopped(ifc),maindev=', 1)
    changed = True
    print('errors filter: patched')

old = "_('Information'),with_device?null:(ifc.get('auto')!='0'?null:_('Not started on boot')),"
new = "_('Information'),with_device?null:(stopped?_('Parked \u2014 standby for the ISP uplink'):(ifc.get('auto')!='0'?null:_('Not started on boot'))),"
if new in src:
    print('information: already patched')
else:
    if src.count(old) != 1:
        print('information anchor count:', src.count(old))
        sys.exit(1)
    src = src.replace(old, new, 1)
    changed = True
    print('information: patched')


old = "s.modaltitle=function(section_id){return _('Interfaces')+' \u00bb '+section_id.toUpperCase();};"
new = ("s.modaltitle=function(section_id){return _('Interfaces')+' \u00bb '+ifaceLabel(section_id).toUpperCase();};"
       "s.sectiontitle=function(section_id){return ifaceLabel(section_id).toUpperCase();};")
if 's.sectiontitle=' in src:
    print('sectiontitle: already patched')
else:
    if src.count(old) != 1:
        print('modaltitle anchor count:', src.count(old))
        sys.exit(1)
    src = src.replace(old, new, 1)
    changed = True
    print('sectiontitle: patched')

old = "E('strong',net.getName().toUpperCase())"
new = "E('strong',ifaceLabel(net.getName()).toUpperCase())"
if new in src:
    print('ifacebox label: already patched')
else:
    if src.count(old) != 1:
        print('ifacebox anchor count:', src.count(old))
        sys.exit(1)
    src = src.replace(old, new, 1)
    changed = True
    print('ifacebox label: patched')

if changed:
    open(path, 'w').write(src)
print('size', len(src))
