#!/usr/bin/env python3
"""Add plain-language help to the vendor Device Configuration page.

The page keeps its stock layout; the shared wifi-help.js asset adds an info
icon next to the common radio settings and explains what they do.

Usage:
    python3 vendor-patches/patch-wifi-devcfg.py <stock mtk_wifi_dev_cfg.htm> <output>

The stock file lives on the router at
/usr/lib/lua/luci/view/admin_mtk/mtk_wifi_dev_cfg.htm.
"""
import sys

HEAD_INCLUDES = """<link rel="stylesheet" href="/luci-static/resources/wifi-help.css?v=4">
<script src="/luci-static/resources/wifi-help.js?v=4"></script>
"""

INIT_SCRIPT = """<script type="text/javascript">
if (window.WifiHelp) { WifiHelp.init('devcfg'); }
</script>
"""


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: patch-wifi-devcfg.py <stock mtk_wifi_dev_cfg.htm> <output>")
    src, dst = sys.argv[1], sys.argv[2]
    s = open(src, encoding="utf-8").read()

    if "WifiHelp.init('devcfg')" in s:
        sys.exit("already patched: " + src)

    assert "<%+header%>" in s, "header not found"
    s = s.replace("<%+header%>", "<%+header%>\n" + HEAD_INCLUDES, 1)

    assert "<%+footer%>" in s, "footer not found"
    s = s.replace("<%+footer%>", INIT_SCRIPT + "\n<%+footer%>", 1)

    open(dst, "w", encoding="utf-8").write(s)
    print("wrote", dst)


if __name__ == "__main__":
    main()
