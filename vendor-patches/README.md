# Vendor patches

This firmware's LuCI is a vendor fork. Eight stock files are patched; the
patched copies are kept here so a reflash/upgrade can be re-patched.

| File | Installed to | Purpose |
|---|---|---|
| `interfaces.js` | `/www/luci-static/resources/view/network/interfaces.js` | Adds the **Physical Interfaces** tab, the `wan → SIM`, `wan6 → SIM6`, `isp → ISP` labels, the interface order **ISP → SIM/SIM6 → other → WireGuard last**, and filters netifd's `STOPPED` code so a deliberately parked SIM shows "Parked — standby for the ISP uplink" instead of "Unknown error (STOPPED)" |
| `lockband.js` | `/www/luci-static/resources/view/modem/lockband.js` | Restores `AT+CFUN=1` on every radio-changing path (network preference, 5G mode, band-lock submit), so an interrupted change cannot leave the modem in flight mode (RF off, SIM never registers) |
| `menu-bootstrap.js` | `/www/luci-static/resources/menu-bootstrap.js` | Decodes numeric HTML entities in menu titles (stock theme only) |
| `bootstrap-header.htm` | `/usr/lib/lua/luci/view/themes/bootstrap/header.htm` | Same fix for the page `<title>` (stock theme only) |
| `mtk_wifi_vif_cfg.htm` | `/usr/lib/lua/luci/view/admin_mtk/mtk_wifi_vif_cfg.htm` | Keeps SSID, security, key, hidden and Wi-Fi standard visible on the Wi-Fi Add/Edit form; folds channel, PMF, WEP/RADIUS, rate and HT/VHT options behind **Show advanced settings**; adds plain-language labels, help icons and friendly mode names |
| `mtk_wifi_overview.htm` | `/usr/lib/lua/luci/view/admin_mtk/mtk_wifi_overview.htm` | Translates the raw mode names (`HE_5G mode` → **Wi-Fi 6 / 802.11ax · 5 GHz**) and adds a short Mode explanation |
| `mtk_wifi_dev_cfg.htm` | `/usr/lib/lua/luci/view/admin_mtk/mtk_wifi_dev_cfg.htm` | Adds the shared help icons and plain-language descriptions to the radio Device Configuration tabs (channel, bandwidth, TX power, OFDMA/MU-MIMO, etc.) |
| `mtkwifi.lua` | `/usr/lib/lua/luci/controller/mtkwifi.lua` | Sets the per-VIF `Wapiifname` bridge token for the **Guest network** checkbox, calls `/usr/sbin/wifi-guest apply/forget`, and reattaches guest VIFs after every Wi-Fi reload/restart |

The shared help assets are not stock files:

| File | Installed to | Purpose |
|---|---|---|
| `wifi-help.css` | `/www/luci-static/resources/wifi-help.css` | Info-icon and tooltip styling shared by the three Wi-Fi pages |
| `wifi-help.js` | `/www/luci-static/resources/wifi-help.js` | Tooltip manager, plain-language help text, friendly labels and mode names |

The guest network helper is not a stock file either:

| File | Installed to | Purpose |
|---|---|---|
| `system/sbin/wifi-guest` | `/usr/sbin/wifi-guest` | Creates `br-guest` (192.168.5.1/24), the dnsmasq guest range and the `wifi_guest` firewall zone; moves VIFs between `br-lan` and `br-guest` |
| `system/init.d/wifi-guest` | `/etc/init.d/wifi-guest` | Boot service: re-create the bridge/DHCP and reattach the saved guest VIFs |
| `system/hotplug/30-wifi-guest` | `/etc/hotplug.d/iface/30-wifi-guest` | Reattaches a guest VIF when it comes up |
| `uci/wifi_guest` | `/etc/config/wifi_guest` | Seed for the saved guest VIF list (`wifi_guest.main.ifaces`) |

`physical-tab.js` is the snippet injected into `interfaces.js`. The
`patch-*.py` scripts re-apply the changes to a freshly restored stock file.

## Re-applying after a firmware update

```sh
# copy the stock files off the router first
scp root@<router>:/www/luci-static/resources/view/network/interfaces.js \
    vendor-patches/interfaces.js

python3 vendor-patches/patch-interfaces.py
python3 vendor-patches/patch-menu.py
python3 vendor-patches/patch-header.py
python3 vendor-patches/patch-lockband.py

# Wi-Fi pages: each script takes the stock file and an output path
python3 vendor-patches/patch-wifi-vif.py \
    /path/to/mtk_wifi_vif_cfg.htm vendor-patches/mtk_wifi_vif_cfg.htm
python3 vendor-patches/patch-wifi-overview.py \
    /path/to/mtk_wifi_overview.htm vendor-patches/mtk_wifi_overview.htm
python3 vendor-patches/patch-wifi-devcfg.py \
    /path/to/mtk_wifi_dev_cfg.htm vendor-patches/mtk_wifi_dev_cfg.htm
python3 vendor-patches/patch-mtkwifi-guest.py \
    /path/to/mtkwifi.lua vendor-patches/mtkwifi.lua
```

The four JS/theme scripts operate on `vendor-patches/` in place and are
idempotent: they print `already patched` and exit 0 when there is nothing to
do. The four Wi-Fi scripts take the stock file and an output path, and refuse
to patch an already-patched input. Each fails loudly if its anchor text is
missing — that means the vendor file changed shape, so diff by hand before
forcing anything.

The installer copies the patched `interfaces.js`, the Wi-Fi templates,
`mtkwifi.lua`, the shared `wifi-help.*` assets and the guest helper by default
(`WITH_VENDOR_PATCHES=1`) and keeps the previous files as `*.orig`. It seeds
`/etc/config/wifi_guest` and enables `wifi-guest`. The `lockband.js` patch is
applied only when 3ginfo-lite is installed. The two Bootstrap files are only
copied when `WITH_BOOTSTRAP_PATCHES=1`, because the console theme does not use
them.

## Notes

- `interfaces.js`, `mtkwifi.lua` and the three `mtk_wifi_*` templates are
  specific to this vendor LuCI build. Do not drop them onto a different LuCI
  generation.
- The guest bridge is created outside netifd because the vendor `wapp` owns the
  Wi-Fi VIFs; the Wi-Fi reload hook and `wifi-guest` boot service reattach them
  after a restart. The main LAN stays on `br-lan`.
- Browser cache is aggressive; hard-reload (or a new tab) after patching.
- After editing any Lua controller: `rm -rf /tmp/luci-modulecache` and restart
  `uhttpd`.
