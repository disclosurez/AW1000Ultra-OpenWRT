#!/usr/bin/env python3
"""Make the vendor Wireless Overview easier to read.

The stock page prints the raw MediaTek mode name ("HE_5G mode") and has no
explanation of what it means.  This patch translates the common mode names and
adds the shared Wi-Fi help assets.

Usage:
    python3 vendor-patches/patch-wifi-overview.py <stock mtk_wifi_overview.htm> <output>

The stock file lives on the router at
/usr/lib/lua/luci/view/admin_mtk/mtk_wifi_overview.htm.
"""
import sys

HEAD_INCLUDES = """<link rel="stylesheet" href="/luci-static/resources/wifi-help.css?v=4">
<script src="/luci-static/resources/wifi-help.js?v=4"></script>
"""

INIT_SCRIPT = """<script type="text/javascript">
if (window.WifiHelp) { WifiHelp.init('overview'); }
</script>
"""

MODE_HELPER = """
local function wifi_mode_label(name)
    local map = {
        ["HE_5G mode"] = "Wi-Fi 6 (802.11ax) · 5 GHz",
        ["HE_2G mode"] = "Wi-Fi 6 (802.11ax) · 2.4 GHz",
        ["A/AC/AN mixed"] = "Wi-Fi 5/4 mixed (802.11ac/n/a)",
        ["AC/AN mixed"] = "Wi-Fi 5/4 mixed (802.11ac/n)",
        ["A/N in 5 band"] = "Wi-Fi 4 (802.11n) · 5 GHz",
        ["A only"] = "802.11a legacy · 5 GHz",
        ["B only"] = "802.11b legacy · 2.4 GHz",
        ["G only"] = "802.11g legacy · 2.4 GHz",
        ["B/G mixed"] = "802.11b/g legacy · 2.4 GHz",
        ["N only"] = "Wi-Fi 4 (802.11n)",
        ["AC only"] = "Wi-Fi 5 (802.11ac)",
        ["AX only"] = "Wi-Fi 6 (802.11ax)",
        ["BE only"] = "Wi-Fi 7 (802.11be)",
    }
    return map[name] or name
end
"""

MODE_TIP = (
    "Wi-Fi standard for this network. Wi-Fi 6 (802.11ax) is newer and faster "
    "than Wi-Fi 5 (802.11ac) and Wi-Fi 4 (802.11n). Older devices can usually "
    "still connect."
)

OLD_MODE = ('<strong><%:Mode:%></strong> <span>'
            '<%=dev.WirelessModeList[tonumber(vif.__wirelessmode)]%></span>')
NEW_MODE = ('<strong><%:Mode:%></strong> <span>'
            '<%=wifi_mode_label(dev.WirelessModeList[tonumber(vif.__wirelessmode)])%>'
            '</span> <span class="wifi-info" data-tip="' + MODE_TIP +
            '" aria-label="' + MODE_TIP + '" tabindex="0">i</span>')


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: patch-wifi-overview.py <stock mtk_wifi_overview.htm> <output>")
    src, dst = sys.argv[1], sys.argv[2]
    s = open(src, encoding="utf-8").read()

    if "WifiHelp.init('overview')" in s:
        sys.exit("already patched: " + src)

    anchor = 'local mtkwifi = require("mtkwifi")'
    assert anchor in s, "mtkwifi require not found"
    s = s.replace(anchor, anchor + "\n" + MODE_HELPER, 1)

    assert OLD_MODE in s, "mode line not found"
    s = s.replace(OLD_MODE, NEW_MODE, 1)

    assert "<%+header%>" in s, "header not found"
    s = s.replace("<%+header%>", "<%+header%>\n" + HEAD_INCLUDES, 1)

    assert "<%+footer%>" in s, "footer not found"
    s = s.replace("<%+footer%>", INIT_SCRIPT + "\n<%+footer%>", 1)

    open(dst, "w", encoding="utf-8").write(s)
    print("wrote", dst)


if __name__ == "__main__":
    main()
