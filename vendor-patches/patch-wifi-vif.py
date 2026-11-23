#!/usr/bin/env python3
"""Simplify the vendor MTK Wi-Fi VIF form.

The stock admin_mtk/mtk_wifi_vif_cfg.htm puts every radio tuning knob on the
same tab as SSID and security.  This patch keeps the fields needed to create or
edit a network visible and folds the rest behind an "Advanced settings" toggle.

Usage:
    python3 vendor-patches/patch-wifi-vif.py <stock mtk_wifi_vif_cfg.htm> <output>

The stock file lives on the router at
/usr/lib/lua/luci/view/admin_mtk/mtk_wifi_vif_cfg.htm.
"""
import re
import sys

ADV_TBODIES = [
    "REKEY_INTERVAL",
    "WEP",
    "WPAX",
    "PMF",
    "IEEE8021X",
    "RADIUS",
]

# First-cell markup for rows that move under Advanced.  Labels are matched
# inside the Basic table only, so the identical "TX Rate" in the Stations
# table is untouched.
ADV_ROWS = [
    "<td><%:Channel%></td>",
    "<td><%:AP Isolation%></td>",
    "<td><%:WMM Capable%></td>",
    "<td><%:TX Rate%></td>",
    "<td>STBC</td>",
    "<td><%:HT LDPC%></td>",
    "<td><%:VHT STBC%></td>",
    "<td><%:VHT LDPC%></td>",
    "<td><%:DLS Capable%></td>",
    "<td><%:APSD Capable%></td>",
    "<td><%:Fragment Threshold%></td>",
    "<td><%:RTS Threshold%></td>",
    "<td><%:VHT Short GI%></td>",
    "<td><%:VHT BW Signaling%></td>",
    "<td><%:HT Protection%></td>",
    "<td><%:HT Guard Interval%></td>",
    "<td><%:Operating Mode%></td>",
    "<td>A-MSDU</td>",
    "<td><%:Auto Block ACK%></td>",
    "<td><%:IGMP Snooping%></td>",
]

GUEST_ROW = """                <tr id="VIF_GUEST_ROW">
                    <td>Guest network</td>
                    <td>
                        <input type="checkbox" name="__guest" value="1" <% if is_guest then %>checked="checked"<% end %> />
                        <div class="cbi-value-description">Isolated subnet with internet access only; LAN clients are not reachable.</div>
                    </td>
                    <td></td>
                </tr>
"""

IS_GUEST = """
local is_guest = false
if vifidx then
    is_guest = (mtkwifi.token_get(cfgs.Wapiifname, vifidx, "br-lan") == "br-guest")
end
"""

TOGGLE = """            <tbody id="VIF_ADV_TOGGLE_TBODY">
                <tr>
                    <td></td>
                    <td colspan="2">
                        <a href="javascript:void(0)" id="vif-adv-toggle" onclick="vifToggleAdvanced();return false;">Show advanced settings</a>
                        <div class="cbi-value-description">Channel, PMF, WEP/RADIUS, rate limits and HT/VHT options.</div>
                    </td>
                </tr>
            </tbody>
"""

STYLE = """<style type="text/css">
#vif-cfg-basic.vif-adv-off .vif-adv { display: none !important; }
#vif-adv-toggle { font-weight: bold; }
</style>
"""

HEAD_INCLUDES = """<link rel="stylesheet" href="/luci-static/resources/wifi-help.css?v=4">
<script src="/luci-static/resources/wifi-help.js?v=4"></script>
"""

INIT_SCRIPT = """<script type="text/javascript">
if (window.WifiHelp) { WifiHelp.init('vif'); }
</script>
"""

SCRIPT = """function vifToggleAdvanced() {
    var t = document.getElementById('vif-cfg-basic');
    var a = document.getElementById('vif-adv-toggle');
    if (!t || !a) { return false; }
    if (t.classList.contains('vif-adv-off')) {
        t.classList.remove('vif-adv-off');
        a.innerHTML = 'Hide advanced settings';
    } else {
        t.classList.add('vif-adv-off');
        a.innerHTML = 'Show advanced settings';
    }
    return false;
}
"""


def mark_row(seg, label):
    """Add class="vif-adv" to the <tr> whose first cell is *label*."""
    pos = seg.index(label)
    tr = seg.rindex("<tr", 0, pos)
    end = seg.index(">", tr)
    tag = seg[tr:end + 1]
    if "vif-adv" in tag:
        return seg
    if 'class="' in tag:
        tag_new = tag.replace('class="', 'class="vif-adv ', 1)
    else:
        tag_new = tag[:-1] + ' class="vif-adv">'
    return seg[:tr] + tag_new + seg[end + 1:]


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: patch-wifi-vif.py <stock mtk_wifi_vif_cfg.htm> <output>")
    src, dst = sys.argv[1], sys.argv[2]
    s = open(src, encoding="utf-8").read()

    if 'id="vif-adv-toggle"' in s:
        sys.exit("already patched: " + src)

    # Work only inside the Basic tab's table; the Stations/WPS/WDS tables have
    # labels that collide with several of these.
    id_pos = s.index('id="vif-cfg-basic"')
    start = s.rindex("<table", 0, id_pos)
    end = s.index("</table>", start)
    seg = s[start:end]

    old_table = '<table class="cbi-section-table" id="vif-cfg-basic">'
    new_table = '<table class="cbi-section-table vif-adv-off" id="vif-cfg-basic">'
    assert old_table in seg, "basic table tag not found"
    seg = seg.replace(old_table, new_table, 1)

    for tid in ADV_TBODIES:
        pat = re.compile(r'<tbody id="%s"( style="[^"]*")?>' % re.escape(tid))
        m = pat.search(seg)
        assert m, "tbody not found: " + tid
        tag = m.group(0)
        if "vif-adv" in tag:
            continue
        if m.group(1):
            tag_new = tag[:tag.index(" style=")] + ' class="vif-adv"' + m.group(1) + ">"
        else:
            tag_new = tag[:-1] + ' class="vif-adv">'
        seg = seg[:m.start()] + tag_new + seg[m.end():]

    for label in ADV_ROWS:
        assert label in seg, "row label not found: " + label
        seg = mark_row(seg, label)

    assert "<tfoot>" in seg, "basic table footer not found"
    seg = seg.replace("<tfoot>", TOGGLE + "            <tfoot>", 1)

    hidden = '<tr id="VIF_HIDDEN_SSID_ROW">'
    assert hidden in seg, "hidden row not found"
    hidden_end = seg.index("</tr>", seg.index(hidden)) + len("</tr>")
    seg = seg[:hidden_end] + "\n" + GUEST_ROW + seg[hidden_end:]

    s = s[:start] + seg + s[end:]

    anchor = 'local appliedWscValue = diff["WscConfMode"] and mtkwifi.token_get(diff["WscConfMode"][2], vifidx) or nil'
    assert anchor in s, "wsc anchor not found"
    s = s.replace(anchor, anchor + "\n" + IS_GUEST, 1)

    form = '<form method="post" name="cbi"'
    assert form in s, "form not found"
    s = s.replace(form, STYLE + form, 1)

    anchor = "var refreshWpsAjaxFlag = false;"
    assert anchor in s, "script anchor not found"
    s = s.replace(anchor, anchor + "\n\n" + SCRIPT, 1)

    assert "<%+header%>" in s, "header not found"
    s = s.replace("<%+header%>", "<%+header%>\n" + HEAD_INCLUDES, 1)

    assert "<%+footer%>" in s, "footer not found"
    s = s.replace("<%+footer%>", INIT_SCRIPT + "\n<%+footer%>", 1)

    open(dst, "w", encoding="utf-8").write(s)
    print("wrote", dst)


if __name__ == "__main__":
    main()
