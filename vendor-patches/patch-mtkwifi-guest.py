#!/usr/bin/env python3
"""Hook the vendor Wi-Fi controller into the guest bridge helper.

The form's "Guest network" checkbox is posted as __guest.  This patch:
  * sets the per-VIF Wapiifname profile token to br-guest or br-lan;
  * calls /usr/sbin/wifi-guest apply <ifname> <0|1> after saving;
  * calls /usr/sbin/wifi-guest forget <ifname> when a VIF is deleted.

Usage:
    python3 vendor-patches/patch-mtkwifi-guest.py <stock mtkwifi.lua> <output>

The stock file lives on the router at
/usr/lib/lua/luci/controller/mtkwifi.lua.
"""
import sys

GUEST_BLOCK = '''
    -- Guest network: per-VIF bridge name used by wapp and the guest helper.
    -- Set only this VIF's token; other VIFs keep their existing bridge.
    local function set_wapiifname(list, idx, value)
        local t = {}
        for v in string.gmatch((list or "") .. ";", "([^;]*);") do t[#t + 1] = v end
        while #t < idx do t[#t + 1] = "" end
        t[idx] = value
        return table.concat(t, ";")
    end
    local guest = http.formvalue("__guest") == "1"
    cfgs.Wapiifname = set_wapiifname(cfgs.Wapiifname, vif_idx, guest and "br-guest" or "br-lan")
'''

APPLY_BLOCK = '''
    local ifname = vifname
    if http.formvalue("__action") == "vif_add_view" then
        ifname = vifname .. (vif_idx - 1)
    end
    os.execute("/usr/sbin/wifi-guest apply '" .. ifname .. "' '" .. (guest and "1" or "0") .. "'")
'''


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: patch-mtkwifi-guest.py <stock mtkwifi.lua> <output>")
    src, dst = sys.argv[1], sys.argv[2]
    s = open(src, encoding="utf-8").read()

    if "wifi-guest apply" in s:
        sys.exit("already patched: " + src)

    # After a Wi-Fi reload/restart the vendor wapp may re-add every VIF to
    # br-lan. Re-attach the saved guest VIFs to br-guest afterwards.
    reload_anchor = '''    elseif wifi_reload then
        os.execute("wifi reload "..(devname or ""))
        debug_write("wifi reload "..(devname or ""))
    end'''
    assert reload_anchor in s, "reload anchor not found"
    s = s.replace(
        reload_anchor,
        reload_anchor + '\n\n    os.execute("sleep 2; /usr/sbin/wifi-guest boot >/dev/null 2>&1")',
        1,
    )

    # vif_cfg: set the per-VIF bridge and call the helper after the profile save.
    start = s.index("function vif_cfg(")
    end = s.index("\nfunction ", start + 1)
    seg = s[start:end]

    anchor = "    __update_mbss_para(cfgs, vif_idx)"
    assert anchor in seg, "vif_cfg update_mbss anchor not found"
    seg = seg.replace(anchor, anchor + GUEST_BLOCK, 1)

    anchor = "    __mtkwifi_save_profile(cfgs, profile, false)"
    assert anchor in seg, "vif_cfg save anchor not found"
    seg = seg.replace(anchor, anchor + APPLY_BLOCK, 1)

    s = s[:start] + seg + s[end:]

    # vif_del: drop the VIF from the guest list and both bridges.
    start = s.index("function vif_del(")
    end = s.index("\nfunction ", start + 1)
    seg = s[start:end]

    anchor = "            __mtkwifi_save_profile(cfgs, profile, false)"
    assert anchor in seg, "vif_del save anchor not found"
    seg = seg.replace(
        anchor,
        anchor + "\n        os.execute(\"/usr/sbin/wifi-guest forget '\" .. vifname .. \"'\")",
        1,
    )

    s = s[:start] + seg + s[end:]

    open(dst, "w", encoding="utf-8").write(s)
    print("wrote", dst)


if __name__ == "__main__":
    main()
