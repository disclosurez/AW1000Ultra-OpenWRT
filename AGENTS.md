# AGENTS.md — OpenWrt router workspace

> Operating reference shipped with the **AW1000Ultra-OpenWRT** repository.
> Credentials, hostnames, keys and other device-specific identifiers have been
> replaced with placeholders (`<router-password>`, `example.com`, `<wan-ip>`, …).
> The step-by-step replication guide is [`docs/INSTALL.md`](docs/INSTALL.md).

This directory holds the scripts and files used to manage the router at
`192.168.0.1`. Read this before changing anything.

## Device

| | |
|---|---|
| Model | AW1000_Ultra, MediaTek mt6890 (aarch64), 5G CPE |
| Firmware | OpenWrt 19.07.7 (`5G_modem_Gen2`, kernel 4.19.190) |
| LAN | `br-lan` 192.168.0.1/24 — `eth0`, `ra0`, `rai0`, `rndis0` |
| WAN | **ISP** = `isp` DHCP on `eth1` (physical WAN port, primary) · **SIM** = `wan` mipc on `ccmniX` (5G failover) — see §1c |
| Storage | overlay ~144 MB (only ~23 MB used) — keep files small |
| Time | router clock/timezone is **UTC** |

Access from Windows/WSL:

```bash
wsl -e bash -lc "/root/rsh 'wg show'"
```

`/root/rsh` is a wrapper: `sshpass` + `ssh root@192.168.0.1`. The root password
is inside that file — treat it as a secret. LuCI is at `http://192.168.0.1`.

---

## ⚠️ Safety rules — read every time

1. **Never ban the MAC or IP of the machine you are working from.** Use a fake
   MAC (`02:00:00:00:00:xx`) for any blocking test. A real test ban on the
   admin PC once cut SSH/LuCI and had to be undone from another device.
2. The parental chain is hooked into **INPUT** (because a transparent proxy
   terminates client traffic on the router). A bad rule can lock you out.
   Two safety nets exist — do not remove them:
   - `PARENTAL` returns early for TCP **22** and **80**, so SSH and
     `http://192.168.0.1` remain reachable even for a blocked device.
   - `parental.settings.exempt` is a list of MACs that are never enforced.
     Keep the admin machine's MAC in it.
3. Do not touch `/mnt/vendor/*`, `mtd` partitions, `/rom`, bootloader or
   firmware images. No `firstboot`, no flashing, no `mtd write`.
4. Back up before editing core config:
   `cp /etc/config/{network,firewall,dhcp,parental,vpnsplit} /root/backup-$(date +%s)/`
   (`/root/vpnsetup-backup-*` already holds the pre-VPN state.)
5. Prefer `fw3 reload` / service reloads over reboots. A reboot interrupts the
   whole LAN (~1–2 min); only do it when asked.
6. Never leave test rules behind. After testing: delete test sections, commit,
   run `/usr/sbin/parental-control apply`, then confirm
   `iptables -S PARENTAL` shows only the two RETURN rules.
7. Do not change LAN IP/DHCP scope/firewall zones without a working way back in
   (another LAN device, serial console).
8. Overlay is small. No unbounded logs on flash; `/tmp` is RAM.
9. This is a vendor LuCI fork; test every page in a browser, not just HTTP 200.

---

## Components

### 1. VPN split tunnel (WireGuard, NordVPN `<server-id>`)

Purpose: send **only** the listed domains/IPs through the VPN, everything else
via the ISP.

| File | Role |
|---|---|
| `/etc/config/vpnsplit` | `vpn` interface, `domains` list, `ips` list (CIDR ok), optional `dns` |
| `/etc/init.d/vpnsplit` | procd service: syncs dnsmasq ipset/server lists, builds `vpnset` (`hash:net`), fwmark `0x1` → table 100 → selected VPN, blackhole when down |
| `/etc/firewall.vpnsplit` | fw3 include: recreates ipset + mangle MARK rules after every firewall reload |
| `/etc/hotplug.d/iface/30-vpnsplit` | sets/removes the table-100 route on ifup/ifdown |
| `/usr/sbin/vpnplit-route` | cron watchdog (1 min) for the table-100 route |
| LuCI | **Network → VPN Split Tunnel** |

Key commands:

```bash
wg show
ip route show table 100
ipset list vpnset
/etc/init.d/vpnsplit reload
```

Verification trick: add `<test-ip>`, then
`curl --resolve ipinfo.io:443:<test-ip> https://ipinfo.io/ip` →
`<vpn-exit-ip>` (US exit). Remove the test IP afterwards.

### 1b. Home WireGuard tunnel (`wghome`)

Second, independent WireGuard interface so the router is reachable from the
home WG server (WGDashboard on `<wg-server-lan-ip>`, `wg0` = 10.0.0.1/24).

| Item | Value |
|---|---|
| Router peer IP | `10.0.0.4/32` |
| Endpoint | `<wg-server-lan-ip>:51820` (LAN address — avoids NAT hairpin) |
| Server public key | `<home-wg-server-pubkey>` |
| Router public key | `<router-wg-pubkey>` |
| AllowedIPs (router side) | `10.0.0.0/24` only — **never** 0.0.0.0/0, it must not take the default route |
| Firewall | zone `wghome`: input/forward ACCEPT, masq; forwardings lan↔wghome |
| Keys | `/root/wghome.key` / `/root/wghome.pub` on the router |

**Server side must add** a peer with the router public key and
`AllowedIPs = 10.0.0.4/32`; until then there is no handshake. It runs alongside
`wgvpn` (table 100 split tunnel) without conflict.

`vpn.example.com` resolves to the router's WAN IP (`<wan-ip>`), so a
firewall redirect **WAN udp/51820 → <wg-server-lan-ip>:51820** (with fw3 hairpin
reflection) is required for external clients — added.


### 1c. ISP uplink + SIM failover

Two uplinks, **ISP first**:

| | ISP (primary) | SIM (failover) |
|---|---|---|
| UCI interface | `isp` | `wan` |
| Device | `eth1` (WAN port) | `ccmniX` — **X changes on every dial** |
| Protocol | `dhcp` | `mipc` (`<carrier>`, APN `<apn>`, plmn `<plmn>`) |
| UCI route metric | 40 | 50 |
| Firewall | zone `wan` (network list `wan wan6 isp`) | same zone |

The watchdog `/usr/sbin/wan-failover` (procd service `wanfailover`) probes the
ISP uplink every 10 s with `ping -I eth1` and owns the **default route**.

While the ISP answers, the SIM is **parked**: `wan` is brought down (PDP context
torn down, no SIM data at all) and the modem link's IPv6 default route is
dropped (`accept_ra=0` on the `ccmni*` links) — otherwise clients' IPv6 traffic
would still leave through the SIM. Waking it takes **~2 s**.

Route metrics use fixed, per-device slots: ISP 10 (up) / 60 (down),
SIM 20 (up) / 50 (down). The kernel keys default routes by prefix+metric, so
the slots must never collide — a `replace` at a shared metric silently deletes
the other path (this bug stranded the router on the SIM once). Transitions
demote the old path first, then promote the new one. UCI metrics are only the
degraded fallback: with the watchdog dead, ISP 40 beats SIM 50.

- switch to SIM after **2** failed probes (~7-10 s), back to ISP after **2** good
  ones (~6-8 s); the ISP probe is a real internet check, not link state
- while the SIM is active, a `from <isp-ip> lookup 201` rule keeps the ISP's own
  traffic (DHCP renew, probes) on `eth1` — otherwise renews would leave via the
  SIM because the DHCP server is off-subnet
- on switch it flushes conntrack for the abandoned device, so clients retry on
  the new path immediately
- state + addresses: `/tmp/wanfailover.status` (`state=isp|sim`, `active=`,
  `sim_parked=1`, `wan_ip=`, `modem_ip=`), logs as `wanfailover`
  (Logs → Services → VPN)
- the modem device is resolved from `ubus` every cycle (`ccmni2`, `ccmni3`, …),
  never hardcoded
- **the parked SIM shows `Error: Unknown error (STOPPED)`** in this LuCI: netifd
  reports the code `STOPPED` for an administratively stopped interface and the
  vendor `network.js` error map has no message for it. `vendor/interfaces.js`
  filters that code and prints `Information: Parked — standby for the ISP
  uplink` instead. A stopped interface is not a fault; don't "fix" it by
  restarting the SIM (the watchdog parks it again within 10 s).
- `sim_park 0` in `/etc/config/wanfailover` keeps the SIM dialled as a hot
  standby instead (route metric 50, IPv6 still leaks)

**Naming / vendor constraint.** `isp` is a plain UCI rename (`wanb` before).
The modem section **must stay `wan`**: `atcid`, `/etc/init.d/mipc_wan.init`
and `EasyMesh_openwrt.sh` hardcode `network.wan` and would recreate a second
mipc interface (both dialling the same modem) if it disappeared. `wan6` is
equally vendor-referenced. The UI shows them as **SIM** / **SIM6** via the
label map in `vendor/interfaces.js` (`IFACE_LABELS`); the LuCI page still says
`wan` only inside the config files.

```bash
cat /tmp/wanfailover.status
ip route show default
/usr/sbin/wan-failover check      # probe once, apply, print status
/etc/init.d/wanfailover restart
logread -e wanfailover | tail
```

Test drill (safe, SSH is on br-lan): blackhole the WAN port and watch the switch.

```bash
iptables -I OUTPUT -o eth1 -j DROP; iptables -I FORWARD -o eth1 -j DROP
sleep 40; cat /tmp/wanfailover.status          # state=sim, sim_parked=0
iptables -D OUTPUT -o eth1 -j DROP; iptables -D FORWARD -o eth1 -j DROP
sleep 30; cat /tmp/wanfailover.status          # state=isp, sim_parked=1
ip route show default                          # only eth1 metric 10
ifstatus wan | grep '"up"'                     # false — SIM torn down
```

`./test-wanfailover2.sh` runs that drill end to end and prints the SIM state at
each step.

### 1d. Uplink switch notifications (Telegram)

The watchdog pings the phone when it actually switches, so a silent ISP outage
does not go unnoticed.

| File | Role |
|---|---|
| `/usr/sbin/wan-notify` | `sim\|isp <reason>` · `init` · `heartbeat` · `test` · `chatid` · `status` |
| `/etc/wan-notify.conf` | `TG_TOKEN`, `TG_CHAT` (comma-separated ok), `MUTE` — mode **600** |
| `/usr/sbin/wan-failover` | `notify()` after each state transition (detached; never blocks the probe loop) |
| cron | `0 9 * * * wan-notify heartbeat` — dead-man's switch: no message = no router |
| log | `logger -t wan-notify`, `/tmp/wan-notify.log` (capped 64 KB) |

- Sends only on a real transition (the loop already debounces with
  `FAIL_TRIES`/`OK_TRIES`). A boot is silent (no state file in `/tmp`), but a
  watchdog **restart** that leaves the uplink somewhere other than the last
  reported state does send — otherwise the last alert keeps lying (e.g. a
  manual `ifup isp` flips to SIM, then the restart returns to ISP silently).
- The message names the SIM link address, the ISP address, and the **public
  egress** — the carrier's NAT address is not an interface address, so it is
  asked from `cloudflare.com/cdn-cgi/trace` at send time and simply omitted if
  that lookup fails.
- It goes out over whichever uplink just came up, so a switch *to* the SIM is
  reported over the SIM (and carries the carrier's address).
- `MUTE` (default 300 s) keeps a flapping ISP from pinging every cycle; held-back
  switches are counted and appended to the next message (`+3 suppressed`).
- Delivery retries 3× at 5 s, `-4` + 10 s timeout, because DNS can be stale for a
  second or two right after the route changes.
- The token is **never** in `argv`: `curl` runs from a 0600 `--config` file that
  is deleted immediately.
- Empty token/chat = silent no-op (logged once), so the watchdog is safe before
  setup.

```bash
/usr/sbin/wan-notify status
/usr/sbin/wan-notify chatid     # ids that have written to the bot
/usr/sbin/wan-notify test
/usr/sbin/wan-notify heartbeat
tail -5 /tmp/wan-notify.log
```

Getting the token: Telegram → **@BotFather** → `/newbot` → name + username
ending in `bot` → paste the token into `TG_TOKEN`; open the bot, press START,
send anything, then run `wan-notify chatid` and put that in `TG_CHAT`.

### 2. Parental control

| File | Role |
|---|---|
| `/etc/config/parental` | `device` sections (`enabled`, `name`, `mac`, `mode` = `ban`/`schedule`, `start`, `end`, `days`) + `settings.exempt` |
| `/usr/sbin/parental-control` | builds `PARENTAL` chain in FORWARD+INPUT, logs blocks (`PTRL …`), writes `/tmp/parental.status` and `/tmp/parental.log` |
| `/usr/sbin/parental-acct` | samples `PARENTAL_ACCT` counters into `/etc/parental_usage` (cron: every 3 min) |
| `/etc/firewall.parental` | fw3 include: reapply after firewall reload |
| cron | `* * * * * parental-control apply`, `*/3 * * * * parental-acct` |
| LuCI | **Network → Parental Control** (Blocking Rules + Devices & Activity) · **Status → Devices & Activity** shortcut (alias) |

Rules page is a **custom HTML form** (`view/parental/rules.htm` +
`controller/parental.lua`) because this vendor LuCI's CBI TypedSection
add/remove never sends the section-create marker, so saving silently failed.

Blocking behaviour: blocked devices lose internet/proxy access but keep SSH
(port 22) and plain HTTP LuCI (port 80). Existing sessions are flushed with
`conntrack -D` when a device is blocked.

**Domain blocks** (LuCI tab *Domain Blocks*) are `config domain` sections with
`enabled`, `domain`, `target` (`all` or `mac:AA:BB:…`), `days`, `start`,
`end`. `parental-control` evaluates the schedule every minute and calls
`/usr/sbin/parental-domains`, which maps active rules to ipsets (`pcall` for
all devices, `pd_<12hex>` per MAC) and writes
`/tmp/dnsmasq.d/parental-domains.conf`. Traffic to resolved IPs is dropped in
the `PARENTAL` chain, so blocking works even if a client uses another DNS
server; `/usr/sbin/parental-domains refresh` (cron every 15 min) re-resolves
domains into the sets. Caveat: IP-level blocking can affect other services
sharing a CDN address.

**Devices & Activity** has **All / LAN / Guest Wi-Fi** scope tabs. A device is
guest when its lease is in `192.168.5.0/24`, it appears on `br-guest`, or its
bridge port is one of the saved guest VIFs (`wifi_guest.main.ifaces`, `ra1`,
`rai1`). Scan, Ports and Block/Unblock keep the selected scope. The same page
is reachable from **Status → Devices & Activity** via an alias entry in
`controller/parental.lua`.

Device discovery combines DHCP leases, ARP on `br-lan`/`br-guest`, and the
bridge FDB (L2-only devices with no IP). **Scan LAN** runs
`/usr/sbin/lan-scan` — a parallel ping sweep of `192.168.0.0/24` and
`192.168.5.0/24` (~8 s) — so wired devices with static IPs that had no ARP
entry show up with their IP. Manufacturer comes from `/data/oui/oui.tsv`
(refreshed monthly by `/usr/sbin/oui-update`), and each row has a
Block/Unblock button (exempt management MACs show `exempt`).

**Open ports**: each row has a `Ports` button that runs `/usr/sbin/port-scan`
(parallel TCP connect probe with a 1 s timeout over 25 common ports:
21,22,23,25,53,80,110,139,143,443,445,515,631,993,995,1883,3306,3389,5000,
5900,8000,8080,8443,9100,32400). Results are cached in `/tmp/portscan.cache`
and shown in the Open ports column. `/usr/sbin/port-scan-all` runs from cron
every 30 minutes and rescans every known LAN/guest IP (8 devices at a time,
~8 s for ~64 devices), replacing the cache. TCP only; devices without an IP
can't be scanned.

⚠️ **Bandwidth numbers are approximate.** The MTK hardware fast path bypasses
netfilter and conntrack for sustained flows, so `PARENTAL_ACCT` only sees a
fraction of heavy traffic (e.g. a 20 MB download may register a few hundred
KB). Do not present these totals as exact billing-grade data.

### 4. WiFi (vendor MediaTek stack — not UCI)

- SSIDs live in `/etc/wireless/mediatek/mt7915.1.dat` (2.4 GHz, `ra*`) and
  `mt7915.2.dat` (5 GHz, `rai*`), applied by `/sbin/wifi` + the `wapp` daemon.
- Current SSID: `<your-ssid>` on both bands (`ra0`, `rai0`), WPA2PSK/AES,
  password `<your-wifi-password>`, AP isolation off (`NoForwarding=0;1`).
- `ra0`/`rai0` are bridged into **`br-lan`** with full LAN access. The guest
  network (`br-guest`, 192.168.5.0/24, guest firewall zone) was removed.
- DHCP: `dhcp.lan.force=1`, range `192.168.0.100–249`; the fw3 include
  `/etc/firewall.dhcpwifi` drops DHCP/DHCPv6 on the wired ports (`eth0`,
  `rndis0`) with ebtables, so **only WiFi clients get leases** and wired
  clients stay static.
- LuCI page: `admin/mtk/wifi` (vendor VIF editor). **Do not trust its Save
  button** — JS validation silently blocks submission; editing via
  `document.forms[0].submit()` works but skips the vendor apply step.
- A multi-BSS attempt (`BssidNum=2`, `SSID2=Guest Wifi`) did **not** create
  `ra1`/`rai1`: the driver applied SSID2 to the primary radio and left the
  bridge unchanged. Reverted to `BssidNum=1`; backups are
  `mt7915.{1,2}.dat.bak.guest`. Do not retry this without understanding the
  vendor VIF creation path.
- The three vendor Wi-Fi pages are patched for readability:
  - **Wireless Overview** (`mtk_wifi_overview.htm`) translates raw modes such
    as `HE_5G mode` to **Wi-Fi 6 / 802.11ax · 5 GHz** and explains what Mode
    means.
  - **Add / Edit network** (`mtk_wifi_vif_cfg.htm`) keeps SSID, security,
    password, hidden and Wi-Fi standard visible; the rest is behind **Show
    advanced settings**. Labels are plain language and every setting has an
    info (i) tooltip.
  - **Device Configuration** (`mtk_wifi_dev_cfg.htm`) gets the same info-icon
    help for channel, bandwidth, TX power, OFDMA/MU-MIMO and the other radio
    settings.
  Shared assets `vendor-patches/wifi-help.{css,js}`; patch scripts
  `vendor-patches/patch-wifi-{vif,overview,devcfg}.py`. The router keeps the
  stock templates as `*.orig`. Re-run the patches after a firmware upgrade.

#### Guest network checkbox

- The **Add / Edit network** form has a **Guest network** checkbox. Saving it
  sets the VIF's `Wapiifname` token to `br-guest` (main VIFs stay `br-lan`) and
  calls `/usr/sbin/wifi-guest apply <ifname> <0|1>`.
- `br-guest` is **192.168.5.1/24**; `br-lan` keeps the main SSID
  (`rai0`/`ra0`) and the wired ports. The guest SSID is on `ra1`/`rai1` on
  `br-guest`.
- DHCP/DNS: the main dnsmasq reads `/tmp/dnsmasq.d/wifi-guest.conf`
  (`dhcp-range=set:wifi_guest,192.168.5.100-249`, gateway/DNS 192.168.5.1).
  `dhcp.guest` and `notinterface` are not used. IPv4 only.
- Firewall zone `wifi_guest`: input REJECT except DNS/DHCP and 8088, forward
  REJECT except `wifi_guest`→`wan`; there is no `wifi_guest`→`lan` forwarding.
  The captive portal's `gate_iface` is `br-guest`.
- Persistence: `wifi_guest.main.ifaces` lists the guest VIFs;
  `/etc/init.d/wifi-guest` and `/etc/hotplug.d/iface/30-wifi-guest` reattach
  them. The vendor `wapp` can put every VIF back on `br-lan` after a Wi-Fi
  reload, so the patched `mtkwifi.lua` reload hook runs `wifi-guest boot`
  afterwards.
- The checkbox is per VIF/band: tick it on each band you want isolated. A new
  VIF needs **Save & Apply** (Wi-Fi restart) before the interface exists; the
  helper saves the name and the reload hook attaches it.
- The guest bridge is deliberately outside netifd: the vendor `wapp` owns the
  Wi-Fi VIFs and netifd's bridge setup fights it.

- **Wireless → Guest Wireless** (`admin/mtk/guestwireless`) has three tabs:
  **Overview** toggles `wifi_guest.main.enabled` (takes the saved guest VIFs
  down or brings them back on `br-guest`), toggles the captive portal, and
  shows the guest SSIDs, bridge/subnet, DHCP range and firewall state.
  **Devices** lists current guests from leases/ARP/FDB on `br-guest` and
  posts Block/Unblock to the parental control action (a `redirect=guest`
  returns here). **Logs** shows captive-portal acceptances from
  `192.168.5.0/24` with IP, MAC, vendor, country and requested page, plus a
  raw-log download. The SSID list itself is still set by the **Guest network**
  checkbox in Wi-Fi configuration; this page does not duplicate that list.

### 3. "Physical Interfaces" tab (Network → Interfaces)

| File | Role |
|---|---|
| `/www/luci-static/resources/view/network/interfaces.js` | **patched** vendor JS; original kept as `interfaces.js.orig` |
| `/usr/lib/lua/luci/controller/ifstats.lua` | JSON endpoint `/admin/network/ifstats` with state/speed/duplex/rates/totals |
| `vendor/interfaces.js`, `vendor/physical-tab.js`, `vendor/patch-interfaces.py` | local copy + patch |

Shows the four LAN ports separately (**LAN1–LAN4**) plus wireless radios and USB
tethering, with link state, MAC (netdev only), link speed, duplex, live RX/TX
rate (5 s refresh) and totals.

- LAN1–LAN4 come from the MT7531 switch MIB (`swconfig dev switch0 show`,
  per-port `RxByte`/`TxByte`), so they work even though there is a single CPU
  netdev `eth0`.
- Each row is clickable and expands a device list (IP, MAC). The IP list comes
  from `/proc/net/arp` plus `bridge fdb`, and hostnames from
  `/tmp/dhcp.leases` (which is empty on this device — static clients, so the
  hostname field is blank).
- **Per-port IP attribution is not possible**: the MT7531 driver does not
  expose its ARL/MAC table, and every wired MAC appears on `eth0`. LAN1–LAN4
  therefore show no IP list and are not expandable. Wireless radios
  (`ra0`/`rai0`) and `rndis0` do show and expand the devices seen on that
  netdev.
- Hiding `eth0` when switch ports are present avoids double counting.

---

### 4. LuCI console theme ("AW1000 Console")

Replaces the stock Bootstrap look with a graphite rail + bone canvas console.
**Mode: Operate** — dense but calm, mono data, one jade accent. Full brief in
`PRODUCT.md` + `DESIGN.md`; screenshots are disposable, the CSS is truth.

| File | Role |
|---|---|
| `/www/luci-static/console/cascade.css` | full design system; loaded **after** bootstrap/cascade.css |
| `/www/luci-static/console/console.js` | sidebar drawer/collapse, live overview hero + WAN interface strip, login helpers |
| `/www/luci-static/console/fonts/plexsans.woff2`, `plexmono-*.woff2` | self-hosted IBM Plex (latin subset) |
| `/usr/lib/lua/luci/view/themes/console/{header,footer,sysauth}.htm` | shell, login page |
| `/www/luci-static/resources/menu-console3.js` | sidebar tree from `admin/menu` + page tabs |
| `/usr/lib/lua/luci/controller/console.lua` | JSON endpoint `admin/status/vitals` (WAN, load, mem, clients, Wi-Fi, WireGuard, parental) |
| `theme-console/` (this directory) | source; deploy with `deploy-console.sh` |

Both themes are always installed and selectable. Flip between them in
**System → Theme** (works in either theme — the console topbar has a *Theme*
button, and the stock System menu lists the page too). The change applies
immediately, no reboot:

- **AW1000 Console** (default, `ACTIVATE_THEME=1` points `mediaurlbase` here)
- **Stock (Bootstrap)** — the firmware's original theme, untouched

Manual equivalent (no reboot, SSH stays up):

```bash
uci set luci.main.mediaurlbase='/luci-static/console'   # console
uci set luci.main.mediaurlbase='/luci-static/bootstrap' # stock
uci commit luci
```

The switcher is `luci/controller/theme.lua` + `luci/view/theme/switch.htm`
(`admin/system/theme/set` is POST + CSRF-token only; an unknown theme name is
ignored). If a theme ever breaks so badly the page is unreachable, the uci
command above is the way back.

Backups from install: `/root/console-backup-<epoch>/`.

**Controller changes are cached.** After editing any `luci.controller.*` Lua:

```bash
rm -rf /tmp/luci-modulecache
/etc/init.d/uhttpd restart
```

The overview hero polls `/admin/status/vitals` every 5 s while visible; the
topbar chip polls once per page. All values are real (`ifstatus wan`,
`/proc/meminfo`, `/proc/net/arp`, `iwconfig`, `wg show`, `/tmp/parental.status`).
The **WAN interfaces** strip under the hero lists every interface in the
firewall `wan` zone (ISP, SIM, SIM6), marks the active uplink `In use`, and
shows parked SIM interfaces in amber instead of red.

⚠️ **Sidebar links must include the mode segment.** `menu-console3.js` builds
`L.url(modeName, section, child)` with `modeName = admin`. An early version used
`L.url(section, child)`, producing `/cgi-bin/luci/network/...` and 404s on every
sidebar click. Test a sidebar link after touching that file.

Page-specific fixes in this theme:

- Overview: vendor `Status` becomes **Overview**; hero + 3-column cards; empty
  `DSL`/`Wireless`/UPnP blocks are hidden; live RX/TX sparkline.
- Interfaces: page h3 promoted to a title; zone colors become a 3 px edge bar
  (inline `background-color` is overridden); mobile rows stack with actions below.
- Realtime graphs: load series recolored (teal area + slate/amber lines) with the
  legend; all themes card the graph + stats.
- Parental: card tables, empty state, day chips, device filter, dark activity log,
  approximate-traffic note. The per-device and global blocked-domain fields are
  preserved (added after the initial redesign).
- Firewall status / Software: div-tables carded, uppercase headers on mobile-safe
  scroll containers.

---

### 4. Cloudflare DDNS + Tunnels (`cloudflared`)

| File | Role |
|---|---|
| `/etc/config/cloudflare` | section `ddns` (domains, proxied, providers, cron) + one `tunnel` section per connector |
| `/etc/init.d/cloudflare-ddns` | procd service for `cloudflare-ddns` (favonia updater), env built from UCI |
| `/etc/init.d/cloudflared` | procd service, one instance per enabled `tunnel` section |
| `/etc/cloudflare-ddns.token` | Cloudflare API token, mode 600, passed via `CLOUDFLARE_API_TOKEN_FILE` |
| `/etc/cloudflare-tunnel-<section>.token` | connector token per tunnel, mode 600 |
| `/data/cloudflare/bin/` | the two binaries (14 MB + 38 MB). **Not** on the overlay — `/data` is the 8.5 GB `user_data` partition |
| LuCI | **Services → Cloudflare** (Dynamic DNS / Tunnels) |

The upstream unit file uses `systemd` + `go run …@latest`; neither exists here, so
the same tool is cross-compiled once on the PC and run by procd:

```bash
# in WSL, rebuilds both binaries into dist/
bash /root/openwrt/build-ddns.sh        # cloudflare-ddns v1.18.0 (favonia)
# cloudflared: download cloudflared-linux-arm64 from GitHub releases
bash /root/openwrt/deploy-cloudflare.sh # upload + install + restart
```

Both are static Go binaries and run on the 4.19 aarch64 kernel. Do **not** try
`go run` on the router: that needs a full Go toolchain and ~200 MB.

Behaviour / gotchas:

- `IP4_PROVIDER=cloudflare.trace` is the right choice here — it returns the real
  WAN address (`<wan-ip>`). `cloudflare.doh` fails on this box: TLS to
  `1.1.1.1` is intercepted (`BADCERT_CN_MISMATCH`).
- `PROXIED=0` matters for `vpn.example.com`: it feeds the WAN→51820 redirect,
  and UDP cannot traverse the Cloudflare proxy. Keep that record **DNS only**.
- `IP6_PROVIDER=none` — the AAAA family is left alone.
- Token files are never put in argv or the environment (no `ps`/`ubus` leak);
  the LuCI pages only show whether a token is present, never its value.
- A save with no usable rows is a **no-op** (it will not wipe existing tunnels).
- Tunnel ingress for token-based tunnels is stored in Cloudflare (dashboard →
  Zero Trust → Networks → Tunnels → Public Hostname), so the router needs no
  reconfiguration when hostnames change. The router only dials out.
- The router runs as a **second connector** for tunnel `<tunnel-uuid>`
  (`t_router`), the same tunnel behind `example.com`, `jelly`, `ssh`, `files`…
  Cloudflare balances those hostnames across both connectors — fine while both
  are on the LAN, but if you want the router to serve only its own hostnames,
  create a dedicated tunnel instead.
- That tunnel token has an unusual shape: its `s` field is base64 of a 72-byte
  ASCII string rather than a 32-byte key. cloudflared 2026.11.1 accepts it (four
  connections registered), older builds reject it with *"Provided Tunnel token
  is not valid"* — do not re-encode it.
- The DDNS updater logs as `cloudflare-ddns`, the connector as `cloudflared`
  (`logread -e cloudflared`, or **Logs → Services → Cloudflare**).

```bash
/etc/init.d/cloudflare-ddns restart
/etc/init.d/cloudflared restart
logread -e cloudflare-ddns | tail
nslookup vpn.example.com 127.0.0.1
```

---

### 4b. LED controller (`aw1000-led`)

The firmware's LED daemon (`led_ctrld`) drives the LEDs from the **modem**
state — wrong once the wired ISP uplink is primary and the SIM is parked —
and it rewrites the sysfs LED triggers every few seconds, so the stock
**System → LED Configuration** page (netdev triggers, which this kernel does
not even provide) never takes effect.

| File | Role |
|---|---|
| `/usr/sbin/aw1000-led` | `apply\|daemon\|status\|takeover\|release` |
| `/etc/init.d/aw1000led` | procd service; parks the vendor daemon on start, restores it on stop |
| `/etc/config/leds` | `enabled`, `blink_offline`, `interval`, `test_state` |
| `/usr/share/luci/menu.d/luci-mod-system.json` | patched: **System → LED Configuration** points at our page (`.orig` kept) |
| LuCI | **System → LED Configuration** (live state, settings, test state) |

LED mapping:

| LED | Behaviour |
|---|---|
| `internet:single` | ON when the uplink is online, blinking when offline |
| `status:green` | always ON (system running) |
| `status:red` | ON while the uplink is offline |
| `wifi:green` | ON while a radio (`ra0`/`rai0`) is up |
| `signal:green` | ON while the SIM is the active uplink |

State comes from `/tmp/wanfailover.status` (the watchdog probes the real
uplink every 10 s). `test_state` forces online/offline for trying the
behaviour. Disabling the controller in the page restores the vendor daemon
(`led_ctrld.default_setting.lights_enabled=1`).

```bash
/usr/sbin/aw1000-led status
/etc/init.d/aw1000led restart
# preview the offline look without touching the uplink
uci set leds.settings.test_state=offline; uci commit leds
```

---

### 5. Captive portal (guest Wi-Fi terms page)

The portal is scoped to a **network interface**, selected in
`captiveportal.main.gate_iface` (default `br-lan`). Only traffic entering the
router on that interface is gated. On this firmware `ra0`/`rai0` are bridged
into `br-lan`, so the bridge is the interface to select: iptables matches
`-i br-lan`, never `-i ra0`. The LuCI page offers only interfaces that can be
matched (bridge members and `lo` are hidden).

The splash server is a second uhttpd instance on `/www/portal` (port 8088;
LuCI keeps port 80). It answers **every path** with the T&C page
(`-E /cgi-bin/splash`), so a client that asks for `/generate_204` still gets
the portal.

| File | Role |
|---|---|
| `/etc/config/captiveportal` | `gate_iface`, port, title/intro, session minutes, `exempt` |
| `/etc/init.d/captiveportal` | procd service: a **second uhttpd** on `/www/portal` |
| `/www/portal/index.html` | redirects to the splash |
| `/www/portal/cgi-bin/splash` | renders the T&C page from UCI + the terms file |
| `/www/portal/cgi-bin/accept` | records the acceptance, opens a local session, shows "you're online" |
| `/etc/captiveportal.terms.txt` | the terms text (edit in LuCI or here) |
| `/data/portal/accept.log` | `time \| ip \| mac \| country \| target \| user-agent \| vendor`, capped at 200 KB; view under **Wireless → Guest Wireless → Logs** |
| `/usr/sbin/captiveportal` | `apply\|clear\|sync\|allow <ip\|mac>\|status` |
| `/etc/hotplug.d/dhcp/30-captiveportal` | refreshes the accepted-address set (NAT bypass) on lease events |
| cron | `* * * * * captiveportal sync` (safety net for the hotplug) |
| `/etc/firewall.captiveportal` | fw3 include: re-applies the chains after a firewall reload |
| LuCI | **Wireless → Captive Portal**, log under **Logs → Services → Captive Portal** |

Portal URL: `http://<gate_iface address>:8088/`. The live guest network is
`br-guest` (`192.168.5.1`, members `ra1`/`rai1`); `br-lan`
(`192.168.0.1`) is also selectable but gates the main LAN and its wired ports.

#### How it works

- `PORTAL_FWD` / `PORTAL_FWD6` are jumped from FORWARD and match
  `-i <gate_iface>`. Exempt MACs return first, accepted clients
  (`portal_ok`/`portal_ok_ip`) pass, DNS/DHCP pass, and everything else is
  REJECTed until acceptance.
- `PORTAL_NAT` DNATs plain HTTP to the **gated interface's own IPv4 address**,
  so a guest bridge on another subnet gets a splash it can actually reach.
  Traffic to the router's own address on port 80 is returned before the
  redirect (LuCI stays reachable), and HTTPS is refused so the device shows
  its own sign-in prompt.
- `portal_ok` (`hash:mac`, timeout = `session_minutes`) holds acceptances.
  `portal_ok_ip` mirrors their current addresses because the nat table cannot
  match a `hash:mac` set on this kernel. `sync` refreshes it from
  `/proc/net/arp` (DHCP hotplug + cron every minute), so a DHCP renewal does
  not bring the splash back. A `hash:mac` set works in both iptables and
  ip6tables.
- There are no DHCP-derived client sets: pending clients are whoever enters on
  the gated interface, so static addresses, a downstream AP and wireless
  clients are all covered.
- `captiveportal.main.exempt` is a space-separated MAC allowlist for your own
  phone/laptop. It is compiled into per-MAC RETURN rules (works in nat too), so
  exempt devices never see the portal on any gated interface.
- The portal adds no INPUT rules, so it does not by itself block router
  management. Whether LuCI/SSH are reachable from a gated network is up to its
  firewall zone: `lan` allows it, while the live `wifi_guest` zone allows only
  the portal port and DNS/DHCP. A bad portal setting therefore cannot cut the
  admin off the main LAN.
- The live router has a guest bridge (`network.guest`, `192.168.5.1`, members
  `ra1`/`rai1`) in firewall zone `wifi_guest` with explicit rules for DNS/DHCP
  and port 8088. That is the intended portal interface. `network.guest` has no
  `option auto`, so the bridge can be down after boot; `ifup guest` brings it
  up. Guests on it do not share `br-lan` (accepted or not).
- Selecting `br-lan` gates the **wired** ports too, because `eth0` and
  `rndis0` share the bridge. Static wired clients will see the splash until
  they accept (or are exempt). Use a dedicated guest bridge to keep wired
  clients out of the portal.
- The page is deliberately short: status, enable and the interface selector.
  Page text, terms, listen port, session length and exemptions are behind
  **Advanced settings**; recent acceptances and splash requests are collapsed
  under **Recent activity**.
- The guest-facing splash and success pages are self-contained (system fonts,
  inline SVG, console palette) and responsive. Clicking **Accept & continue**
  is the consent — there is no separate checkbox. `accept` opens the session,
  appends the acceptance to `/data/portal/accept.log`
  (`ts | ip | mac | country | target | ua | vendor`) and shows a matching
  success page with an optional `Continue to <host>` link and a 5 s meta
  refresh. The vendor is looked up in `/data/oui/oui.tsv`; old lines without a
  vendor field are resolved on display. `splash` still carries the dormant UAM
  fields (`res`, `uamip`, `uamport`, `challenge`) and keeps the
  local/Cloudflare `accept_url` branches.
- Clearing sessions: `/usr/sbin/captiveportal clear`, or wait for the timeout.
- The UI, UCI config and enforcement are local-only. The external/Cudy,
  UAM and RADIUS setup was removed in 2026-11; `captiveportal.main.mode` is
  kept at `local` for compatibility and there is no mode switch in the page.

Gotchas:

- A bridge member (`ra0`, `rai0`, `eth0`, `rndis0`) cannot be gated directly.
  Select the bridge (`br-lan`); the page flags a legacy setting with
  "bridge member — use br-lan".
- A dedicated guest interface also needs a firewall zone that accepts input on
  the portal port (8088) and forwards to the WAN, or the splash cannot be
  reached before login.
- If guests cannot open the page (guest isolation blocking upstream LAN), add a
  public hostname on the tunnel pointing at `http://192.168.0.1:8088` — guests
  can then reach it over the internet path.
- Clearing acceptances: `: > /data/portal/accept.log`.

```bash
/etc/init.d/captiveportal restart
/usr/sbin/captiveportal status
/usr/sbin/captiveportal sync
/usr/sbin/captiveportal allow 192.168.0.42
ip addr show dev br-lan
iptables -S PORTAL_FWD | head
curl -s http://192.168.0.1:8088/cgi-bin/splash | head
curl -si -X POST http://192.168.0.1:8088/cgi-bin/accept \
  -d 'client_ip=192.168.0.42' -d 'url=http://example.com/' | grep -i online
tail -5 /data/portal/accept.log
```

---

### 6. SIEM log forwarding

Ships router logs to an external SIEM. Three processes make it cheap and safe on
a router: **collectors** append to a spool, a **flusher** drains the spool, and
procd supervises each one separately. A dead collector cannot stall delivery
and a dead SIEM cannot stall logging.

```
logread -f ─┐
dns.log  ───┼─> /tmp/siem/events (TSV, capped) ─> flusher ─> syslog UDP/TCP/TLS
accept.log ─┘                                             └─> HTTP(S) JSON
```

| File | Role |
|---|---|
| `/etc/config/siem` | `settings` (enabled, sources, spool, batch) + one `target` (transport, endpoint, token) |
| `/usr/sbin/siem-forward` | collector/flusher/CLI: `flush-loop`, `collect <src>`, `flush`, `compact`, `test`, `status` |
| `/usr/lib/siem/send.lua` | Nixio UDP/TCP sender (one datagram per message; avoids BusyBox `nc` waiting for a reply). Falls back to `nc` if Lua/nixio is absent |
| `/etc/init.d/siem` | procd: one `flush-loop` + one collector per enabled source, `respawn 3600 5 N` |
| LuCI | **Services → SIEM Forwarding**; log under **Logs → Services → SIEM Forwarding** |
| spool | `/tmp/siem` by default (RAM); `/data/siem` to persist across reboot |
| token | `target.token_file`, default `/etc/siem.token`, mode 600, never in argv |

Sources:

- `syslog` — `logread -f`, which asks logd for `lines=0`: new messages only,
  so a collector restart does not replay the 2 MB ring buffer. There is no
  logd cursor, so lines emitted while the collector is down are not recoverable
  except with `settings.syslog_backfill=1` (dump the buffer first, then
  follow; duplicates each start). Lines from the forwarder itself (`siem:`)
  are filtered to avoid a feedback loop.
- `dns` — the dnsmasq query file (`/data/logs/dns.log`). Tailed by byte offset
  persisted in `/tmp/siem/state-dns.off`; a missing offset starts at the
  current end, so a reboot does not re-ship 20 MB of history. Rotation is
  detected by inode change (and by `size < offset` for a truncate).
- `portal` — `/data/portal/accept.log`, same offset logic.

Transports:

- **syslog** — RFC5424 (default) or RFC3164 over `udp`, `tcp` (Lua/nixio,
  `nc` fallback) or `tls` (OpenSSL `s_client`). TCP/TLS uses RFC6587 octet
  counting. Facility is
  configurable (`local0` default), severity is taken from the source
  `facility.severity` token (default `info`); the raw line is kept in MSG and
  the source/client go in `[aw1000@32473 …]` structured data.
- **http** — `curl` POST. `http_format` is `jsonl` (NDJSON), `array`
  (`{"host":…,"events":[…]}`), `splunk` (HEC envelope) or `raw`. Tokens are
  read from a 0600 file and passed via a temporary `curl --config`, never argv.
  2xx is success; 5xx/408/429 and 401/403 are retried (an auth fix must not lose
  data); other 4xx drops the batch when `drop_on_4xx=1` so one bad payload
  cannot block the queue.

Spool semantics: capped by `settings.spool_max_kb` (4 MB); when full, the
**oldest** events are dropped (halving until under the cap) and counted
(`status` `dropped=`). Delivery is
at-least-once — a crash between send and offset write can duplicate a batch.
`/tmp` is lost on reboot; `/data/siem` persists but writes eMMC.

```bash
/usr/sbin/siem-forward test
/usr/sbin/siem-forward status
/usr/sbin/siem-forward flush
/usr/sbin/siem-forward compact
logread -e siem | tail
cat /tmp/siem.status
```

Typical targets: Wazuh/Graylog/rsyslog on `6514/tcp+tls` or `514/udp`; Splunk
HEC on `https://splunk:8088/services/collector/event` with
`http_format=splunk`. The router dials out, so no input firewall rule is
needed. TLS syslog needs `openssl-util`; HTTP TLS uses curl's CA store.

⚠️ DNS and portal events contain client IP/MAC, hostnames and user agents.
Untick those sources when that data must not leave the device.

---

### 7d. OpenCode client (`ocproxy`)

**Tools → OpenCode**. Pairs with an existing OpenCode server and serves its
web UI through the router, so the whole OpenCode app is usable from LuCI.

OpenCode V2's server is password-protected and normally opened through a
one-time pairing link (`/auth/connect/<code>`, five minutes, single use) that
sets an `opencode_session_<port>` cookie. `ocproxy` does that once and then
reverse-proxies the server on the LAN with the cookie injected, so the browser
never holds the server password.

| Item | Value |
|---|---|
| Page | **Tools → OpenCode**, or `http://192.168.0.1:8091/` |
| Binary | `/data/ocproxy/bin/ocproxy` (static Go, ~6 MB) |
| Source | `ocproxy/main.go`, build with `./build-ocproxy.sh` |
| Config | `/etc/config/opencode` (upstream, password, pair link, port, TLS) |
| Endpoints | `/__status` (paired, upstream, cookie age), `POST /__pair` |

Pairing paths:

- **Password** — `opencode service status` prints the server URL; the password
  is the one `opencode serve` prints (or `opencode service set password`).
  `ocproxy` calls `POST /api/pair` (Basic `opencode:<password>`) and redeems the
  code.
- **Pairing link** — `opencode pair` (local) or `opencode pair --remote`
  (OpenTunnel) prints `…/auth/connect/<code>`; paste it into the page. It is
  used instead of the password and expires after five minutes.
- The proxied session lasts 30 days or until the server password changes; the
  page's **Pair now** button re-pairs.

The proxy strips `X-Frame-Options` and CSP so the UI can be iframed, rewrites
redirects to stay local, drops cookie `Domain`/`Secure` attributes, and
forwards WebSocket upgrades (the app streams events over one). It binds the LAN
LAN/WireGuard addresses: the listener is `0.0.0.0:<port>` so a hostname or
WireGuard address works as well as `192.168.0.1` (the WAN zone still drops the
port). The LuCI page probes the host you used, then falls back to the LAN IP.
A 401 from the server (restart or password change) triggers **one automatic
re-pair** and a retry of the request, so sessions come back without pressing
Pair now.

### HTTPS

The app is also reachable on the console's own HTTPS origin, which is what the
page embeds when you open it over `https://`:

| Piece | Role |
|---|---|
| `/data/ocgate/bin/ocgate` | TLS terminator on `:443` using `/etc/ocgate.crt` (converted from uhttpd's DER cert) |
| routing | `/api/`, `/assets/`, `/session`, `/server`, `/sw.js`, ... -> ocproxy; everything else -> uhttpd `:80` (LuCI) |
| app URL | `https://<host>/?oc=1` (the SPA's router assumes the origin root) |
| cookies | `oc_gate` scoped to the app paths, so LuCI never sends it |

uhttpd no longer listens on 443 (`/root/uhttpd.bak.ocgate` keeps the old
config). The gate presents the **same certificate** on the same host and port,
so a browser that already accepted the console certificate needs no new
exception. Rollback:

```bash
uci add_list uhttpd.main.listen_https='0.0.0.0:443'
uci add_list uhttpd.main.listen_https='[::]:443'
uci commit uhttpd && /etc/init.d/uhttpd restart && /etc/init.d/ocgate disable
```

```bash
./build-ocproxy.sh
scp dist/ocproxy-arm64 root@192.168.0.1:/data/ocproxy/bin/ocproxy
/etc/init.d/ocproxy restart
curl -s http://192.168.0.1:8091/__status
```

### 7c. Web viewer (link-rewriting gateway)

**Tools → Web Viewer**. A "proxy page": type a URL, and the router fetches
the page and serves it back with every link, form, stylesheet and image
rewritten to pass through the gateway again. The site sees the router's
address, not the client's.

```
browser -> router:8090 -> fetch -> rewrite HTML/CSS -> browser
```

| Item | Value |
|---|---|
| Page | **Tools → Web Viewer**, or `http://192.168.0.1:8090/` (any router address works) |
| Binary | `/data/webview/bin/webview` (static Go, ~6 MB) |
| Source | `webview/main.go`, build with `./build-webview.sh` → `dist/webview-arm64` |
| HTTPS bridge | `/www/cgi-bin/webview` → `/data/webview/bin/wvcgi` (source `webview/cgi/main.go`, `./build-wvcgi.sh`) |
| Config | `/etc/config/webview` (enabled, port; listens on every router address) |

How it works:

- `/` is the viewer's URL bar. `/go?u=<base64>` fetches a page, `/raw?u=<b64>`
  streams an asset (images, CSS, JS, fonts), forms post back to `/go`.
- HTML is parsed with `golang.org/x/net/html`: `href/src/action/srcset/poster`,
  `<style>` blocks and `style="url(...)"` are rewritten; `<base>`, CSP and
  `meta refresh` are dropped; a small "⌂ proxy" badge links home.
- Cookies live in a per-session `http/cookiejar` keyed by the `wv_sid` cookie,
  so logins/carts work without exposing upstream cookies to the client.
- Redirects are followed server-side; POST bodies are forwarded unchanged.
- GET forms keep their target: the form action is replaced by `/go` plus a
  hidden `wv_u` field, and the remaining query fields are appended to the target
  URL (search boxes work). POST forms carry the target in the action's query
  (`/go?wv_u=…`) so the body is forwarded byte for byte. The field is named
  `wv_u` so it cannot collide with a site's own `u` field. Anchors (`#section`)
  survive the hop.
- **Escaped navigations are caught.** Client-side JavaScript can build
  root-relative URLs (`location.href='/search/x?y'`) that no rewriter can see.
  Instead of letting the router's web server answer 404/400, the viewer resolves
  such a path against the page the browser came from (its `Referer`, decoded
  from `/go?u=…`, or the session's last page, RAM only) and proxies it to that
  site. Over HTTPS, `ocgate` routes a path whose `Referer` is a
  `/cgi-bin/webview/` page back through the CGI bridge for the same treatment.
  A `Refresh:` response header is rewritten the same way.
- **No browsing record.** The viewer keeps no history: URLs are never logged or
  written to disk, sessions (cookie jar + last page) live only in RAM and expire
  after 30 idle minutes, and every response sends `Cache-Control: no-store` and
  `Referrer-Policy: same-origin` so nothing is cached and the gateway URL is
  never sent to a third party (same-origin only — that is also what lets an
  escaped click be traced back to its page). Site `<meta name=referrer>` tags
  are dropped so a page cannot override it. The upstream `Referer` is the
  originating page (origin only cross-site), as a real browser would send.
- Every proxied page carries a fixed address bar (home, back, URL field, Go)
  injected after the rewrite pass, so it is never itself rewritten. Frames get
  `&e=1` and are served without the bar to avoid nesting it.
- **Load here embeds the viewer at the address the console was opened on** —
  LAN IP, hostname or the WireGuard address (`10.0.0.4`) — not a hardcoded LAN
  IP, so it also works remotely. The iframe has no initial `src` (an empty src
  makes the browser load the LuCI page inside itself); the button probes the
  viewer first and prints the URL it tried when there is no answer.
- **Over HTTPS the page embeds `/cgi-bin/webview/` on the same origin**, not
  `http://<lan>:8090` (browsers block that as mixed content). `wvcgi` is a
  uhttpd CGI that relays to `127.0.0.1:8090` and prefixes the viewer's
  `/go`/`/raw` links with `/cgi-bin/webview`, so the viewer runs inside the
  console origin — including through the Cloudflare tunnel and its Access
  session. `ocgate` (:443) forwards the path to uhttpd on :80 unchanged.
- The service binds every router address (`-addr 0.0.0.0:<port>`), matching
  uhttpd/ocproxy; the WAN zone still drops the port.
- Upstream 4xx/5xx responses are passed through with a banner naming the
  status, so a site blocking the router's address is not mistaken for a
  viewer failure (eBay answers 403 to this network even from Chromium).

Limits: this is a rewriting gateway, not a browser. Static/news/article sites
work; single-page apps that need client-side routing, WebSockets or JS-built
DOM will render partially or not at all. HTTPS is fetched by the router.

```bash
./build-webview.sh
./build-wvcgi.sh
scp dist/webview-arm64 root@192.168.0.1:/data/webview/bin/webview
scp dist/wvcgi-arm64   root@192.168.0.1:/data/webview/bin/wvcgi
ssh root@192.168.0.1 'chmod 755 /data/webview/bin/wvcgi; ln -sf /data/webview/bin/wvcgi /www/cgi-bin/webview'
/etc/init.d/webview restart
curl "http://192.168.0.1:8090/go?url=https://ifconfig.me/ip"    # -> WAN IP
curl -k "https://192.168.0.1/cgi-bin/webview/"                  # same-origin bridge
```

### VPN egress (NordVPN)

The viewer's own requests go through the NordVPN WireGuard interface (`wgvpn`)
and **fail open** when the tunnel is down:

| Piece | Value |
|---|---|
| Socket mark | `SO_MARK 0x2`, set by the binary (`webview -mark 0x2`) on its dialer |
| Policy rule | `ip rule fwmark 0x2 lookup 101` (pref 100) |
| Table 101 | `default dev wgvpn scope link` only while `wg latest-handshakes` is < 180 s |
| Fail open | table flushed -> packets fall through to `main` -> WAN, never blocked |
| Reconcile | `/usr/sbin/webview-vpn apply` on boot, on `wgvpn` ifup/ifdown (hotplug), after every `fw3` reload (firewall include) and from cron every minute |
| Status | Tools -> Web Viewer -> Status shows `NordVPN (wgvpn) · up · handshake Ns` or `WAN · VPN unavailable, failing open` |

`webview-vpn status|apply|disable` manages it. The mark is per-socket, so no
iptables owner rule is involved and nothing else on the router is affected.
DNS still goes to dnsmasq on loopback (local table), so lookups themselves are
not tunnelled.

### 8. SMB file shares (client)

**Tools → File Shares** browses SMB/CIFS shares on the LAN and uploads or
downloads files. It uses `smbclient` (package `samba4-client`) on demand — no
kernel module, no `mount`, nothing written to flash.

| File | Role |
|---|---|
| `/etc/config/fileshares` | `share` sections: `label`, `host`, `share`, `port`, `user`, `domain`, `guest` |
| `/etc/fileshares.secrets` | passwords, one `section=password` line, mode 600 |
| `luci/controller/fileshares.lua` | page + `list`, `upload`, `download`, `mkdir`, `delete`, `test`, `save` |
| `luci/view/fileshares/overview.htm` | share list, browser panel, upload control |

Behaviour:

- Passwords never reach `ps`: smbclient is called with `-A <temp auth file>`
  (mode 600, removed immediately). They are not stored in the UCI file.
- Uploads stream through LuCI's multipart handler straight to
  `/data/fileshares` (100 MB cap), then `smbclient put`; downloads are staged
  in the same directory, streamed to the browser and deleted. Stale staging
  files are pruned after 60 minutes.
- Names and paths are validated (`"`/`\`/newlines refused) and every shell
  argument is single-quoted; the SMB command is one `-c` string.
- CSRF: every changing call (`list`/`upload`/`mkdir`/`delete`/`save`) needs the
  LuCI token; downloads are GETs of the configured share.
- Guest access (`guest=1`) uses `-N -U guest` and no auth file.

```bash
opkg install samba4-client
smbclient //192.168.1.20/test -p 445 -U user -c 'ls'
```

### Router storage (drop box)

The same page keeps files **on the router**: `/data/files`, 1 GB total and
100 MB per file, listed/uploaded/downloaded/deleted from the GUI. It needs no
SMB server and is useful as a quick drop box between machines; downloads are
ordinary authenticated LuCI requests.

| Item | Value |
|---|---|
| Directory | `/data/files` (on the 8.5 GB `user_data` partition) |
| Budget | 1 GB total, enforced per upload (`used + size <= 1 GB`) |
| Per file | 100 MB (multipart envelope allowed 1 MB extra) |
| Staging | `/data/fileshares` for both router and SMB transfers, cleaned after 60 min |
| Endpoints | `local_list`, `local_upload`, `local_download`, `local_delete` |

Test drill (used during development): an SMB server on `192.168.1.20:1445`
with share `test`; list → upload `demo.txt` → download → byte-identical, plus
`mkdir` and `delete` round trips. Router storage: 10/20/50/80/100 MB uploads
stored and downloaded with matching MD5; a 101 MB upload was refused.

---

## Operational commands

```bash
# run any router command from Windows
wsl -e bash -lc "/root/rsh 'iptables -S PARENTAL'"

# or write a script here and run it
wsl -e bash /root/openwrt/<script>.sh
```

**Do not embed pipes, quotes or backslashes in a one-liner passed through
PowerShell** — PowerShell mangles them. Put the command in a `.sh` file here
and execute that file.

Useful checks:

```bash
wg show
ip route show table 100
ipset list vpnset | head -20
iptables -S PARENTAL
iptables -S FORWARD | head -5
cat /tmp/parental.status
cat /etc/parental_usage
logread -e parental | tail
cat /tmp/wanfailover.status
ip route show default
logread -e wanfailover | tail
cat /tmp/siem.status
logread -e siem | tail
```

---

## Known pitfalls

- `entry(...).leaf = true` on a **parent** node stops path descent: requests to
  its `/save` or `/status` children render the parent page instead of running
  the handler. Use `.dependent = false` on the parent and `.leaf = true` only on
  the handlers (this silently broke the captive portal save).
- Custom LuCI forms are hand-written HTML here: every input must sit **inside**
  the `<form>`, or it is never submitted and looks "unsaveable".
- dnsmasq `ipset` option requires a leading slash: `/domain1/domain2/setname`.
- `uci delete x.y.list` removes the **whole list**, not one item.
- Compound list edits: re-add all values explicitly, then commit.
- Lua reserves `end` — a table key must be `r["end"]`, never `r.end`.
- Lint Lua before deploying: `luac -p file.lua` (available in WSL).
  Templates cannot be linted this way — load the page and watch for HTTP 500.
- `scp` to dropbear requires `-O`.
- LuCI caches the menu tree in `sessionStorage`: after adding a page, log out
  and back in (or open a new tab); F5 is not enough.
- Vendor JS is cached by the browser; new tab/hard reload after patching.
- Patched vendor files (originals kept as `*.orig`): `view/network/interfaces.js`,
  `menu-bootstrap.js` and `themes/bootstrap/header.htm`. The menu one decodes
  numeric HTML entities in titles; the theme escapes `&` twice otherwise, so a
  title like `Devices & Activity` renders as `Devices &#38; Activity`.
- Schedules run on the router clock, currently **UTC**.
- The router runs a transparent proxy (PassWall/OpenClash), so client traffic
  may hit INPUT, not FORWARD — that is why both are hooked.
- **No usable packet SPAN/TAP for NDR.** The MT7531 `swconfig` driver exposes
  only `enable_vlan`, `mib`, `pvid` and `link` — no mirror attributes — and
  `eth1` (WAN) is a separate MTK GMAC, not a switch port, so switch mirroring
  would not cover WAN anyway. `tc`/`act_mirred`/`ifb`/`gretap` exist, but the
  MTK HNAT fast path bypasses the Linux stack: a 30 MB LAN→WAN download at
  ~71 MB/s produced only **~51 packets** on `tcpdump -i eth1`; the bulk is
  hardware-offloaded. Software mirroring/ERSPAN therefore sees only
  slow-path/control traffic and is not suitable for Vectra/NDR. Use an
  external TAP or an upstream SPAN/mirror port; the 5G SIM uplink has no cable
  to tap. `/proc/hnat/disabling_hwnat` is read-only (`0`) and disabling HNAT
  would collapse throughput. `tcpdump` is fine for short local captures.
- Never test blocking with a real admin device; see safety rules above.

---

## Testing protocol (safe)

1. Use fake MACs `02:00:00:00:00:01` … for rules.
2. `uci set parental.zztest=device; … ; uci commit parental; parental-control apply`
3. Check `iptables -S PARENTAL` contains `LOG` + `DROP` for the fake MAC and
   `/tmp/parental.status` shows `blocked`.
4. Remove: `uci delete parental.zztest; uci commit parental; parental-control apply`
5. Confirm the chain is back to the two RETURN rules only.

VPN tests: use an IP from a single-service host (e.g. `ipinfo.io`), verify the
exit IP and remove the test entry immediately.

---

## Firmware backup (taken 2026-11-17)

Read-only eMMC dump, **all partitions except `user_data`**, plus the eMMC boot
areas and the first 128 MB of the raw device (partition table/preloader area).

- WSL: `/root/openwrt/backups/router-20261117-2139/`
- Windows: `<off-device copy path>\router-20261117-2139\`
- 61 files, ~1.2 GB, `SHA256SUMS` verified on both sides.

Included: `misc`, `para`, `expdb`, `nvcfg`, `nvdata`, `protect1/2`, `mcf1/2`
(a+b), `seccfg`, `boot_para`, `proinfo`, `nvram`, `md1img`, `md1dsp`, `spmfw`,
`pi_img`, `dpm`, `medmcu`, `sspm`, `mcupm`, `lk`, `tee`, `boot`, `rootfs_sig`,
`rootfs` (a+b), `loader_ext`, `fibo_para`, `fibonv`, `cert`, `board_data`,
`cert_backup`, `board_data_backup`, `flashinfo`, `mmcblk0boot0/1` and
`mmcblk0-head-128M.img`. Partition map in `partmap.txt`.

**Not included:** `user_data` (8.5 GB of personal data) — it does not help
unbricking. **Restore caveat:** these are raw partition images; they can be
written back with `dd` from a booted system/recovery, but they do **not**
replace an MTK BROM/SP Flash Tool recovery if the preloader is dead. Keep the
copy on the Windows machine off the router.

---

## Logging

- System log: `logd`, 2 MB RAM ring buffer, `logread` — lost on reboot.
- **Statistics**: collectd (RRD in `/tmp/rrd`) monitors CPU, load, memory
  (absolute + %), iwinfo and interfaces `br-lan eth1 ccmni1 eth0 br-guest
  wgvpn wghome`. Graphs: **Statistics → Graphs**. vnstat tracks `br-lan`,
  `ccmni1`, `eth1`, `eth0`, `wgvpn` (init patched with `--alwaysadd`; backup
  `/etc/init.d/vnstat.orig`). `eth1` is the ISP port; the SIM data device is
  `ccmniX` and changes on every dial.
- **Logs** menu (`admin/logs`, defined in `/usr/share/luci/menu.d/aw1000-logs.json`):
  - **DNS Log** — per-device DNS history from `/data/logs/dns.log` on the
    eMMC overlay. Clicking a device opens a drill-down with its IP, MAC,
    manufacturer (`/data/oui/oui.tsv`), top domains, hourly activity and every
    query in the window. PTR/bare-IP/root queries are filtered out.
  - **Log scopes** — DNS Log and Network Log have **All / LAN / Guest
    Wireless** tabs (`?scope=all|lan|guest`). Guest is `192.168.5.0/24`,
    `br-guest` and the saved guest VIFs; LAN is `192.168.0.0/24`, `br-lan`,
    `ra0`/`rai0` and the wired ports. The DNS view reads ARP from both bridges.
  - **DNS categories** — matched locally by suffix from
    `/data/dnscat/ndpi.tsv` (nDPI open-source table, ~1.1k domains) plus
    `/data/dnscat/custom.tsv` (user overrides, loaded last). Unknown domains
    show `Uncategorized`; coverage is popular services, not the whole web.
    `/usr/sbin/dnscat-update` refreshes the nDPI table (cron Sunday 05:00) and
    never modifies `custom.tsv`. The page has a category filter and per-device
    top category.
  - **Services** — one page per subsystem, all rendering `view-srvlog.htm`
    (`/admin/logs/services/{cloudflare,captiveportal,parental,vpn,firewall,dhcpdns,sshweb,siem}`).
    Each page greps `logread` for its own tag list: `cloudflare-ddns`+`cloudflared`,
    `captive-portal`, `parental`, `vpnsplit|vpnplit|wgvpn|wghome|wireguard|wanfailover`,
    `firewall|fw3`, `dnsmasq|odhcpd`, `dropbear|uhttpd|crond`, `siem`. Add a group
    in the `GROUPS` table of the template plus a `menu.d` entry to extend it.
  - **System Log** / **Kernel Log** — custom templates (`view-syslog.htm`,
    `view-dmesg.htm`) with filter, download and copy.
  - **Network Log** — filters `logread` into Interfaces, DHCP/DNS, WiFi,
    Firewall and VPN categories.
  - **Processes** — custom `top -b -n1` table. The stock Processes page is
    empty on this firmware because `luci.getProcessList` returns no data.
  - All pages export the currently visible rows/text via the `awLog` helpers in
    `console.js` (`Download` = CSV/TXT, `Copy log` = clipboard).
  - System Log / Kernel Log / Processes were removed from the Status menu in
    `luci-mod-status.json` (backup: same file `.orig`).
- DNS log retention: `/usr/sbin/dnslog-rotate` (cron every 30 min) caps the file
  at 20 MB and keeps 3 gzipped rotations; `/usr/sbin/dnslog-clear` truncates the
  log **every 12 hours (00:00 and 12:00 UTC)** and deletes the rotations.
- Other per-device data: `/tmp/dhcp.leases` (WiFi leases: IP ↔ MAC ↔ hostname),
  `/tmp/parental.log` + `/tmp/parental.status` (recent blocks/state),
  `/tmp/portscan.cache` (open-port scans) — all RAM, lost on reboot.
  Persistent counters: `/etc/parental_usage` (sampled every 3 min).
- Report: `/usr/sbin/dnslog-report` (top domains overall) or
  `/usr/sbin/dnslog-report 192.168.0.42` (per client).
- **SIEM**: `/usr/sbin/siem-forward` ships the syslog ring buffer, DNS queries
  and portal acceptances to an external collector (syslog UDP/TCP/TLS or
  HTTPS). Configure in **Services → SIEM Forwarding**; state in
  `/tmp/siem.status`; see §6 for the spool/queue semantics. It is shipped
  **disabled** because it needs an endpoint and (for HTTP) a token.
- Limits: domains only (no URLs/paths), DoH clients bypass it, IP-literal
  traffic has no name. Delete `/data/logs/dns.log` and unset `logqueries` to
  stop.

## Recovery

- **Locked out by a parental rule:** from another LAN device delete the rule /
  disable it, or use `http://192.168.0.1` (port 80 is exempt) / SSH (22 is
  exempt). Last resort: reboot; rules persist but the chain is rebuilt at boot.
- **VPN broken:** `/root/rollback-vpn.sh` (on the router) undoes the split
  tunnel; backups in `/root/vpnsetup-backup-*`.
- **Firewall mangled:** `/etc/init.d/firewall reload`; if unreachable, reboot.
- **LuCI 500 after an edit:** the traceback is in the returned HTML and in
  `logread`; revert the last file from this directory.

---

## File map (this directory)

> The names below are the original development-workspace sources. This
> repository carries only the deployable subset, arranged as `theme/`,
> `luci/`, `system/`, `portal/`, `data/`, `vendor-patches/` and `uci/` (see
> [`README.md`](README.md)). Probe/test scripts and firmware backups are not
> included.

```
setup-vpn.sh, install-vpnsplit2.sh, install-gui.sh, install-parental.sh   deploy/bootstrap
vpnsplit.init, firewall.vpnsplit, 30-vpnsplit, vpnplit-route, vpnsplit-warm  VPN split tunnel (+ ipset warm-up)
parental-control, parental-acct, firewall.parental                        parental control
firewall.dhcpwifi                                                          DHCP only on WiFi (wired blocked)
lan-scan                                                                  LAN ping sweep for device list
port-scan                                                                 TCP port probe for one device
port-scan-all                                                             periodic scan of all devices
controller-parental.lua, view-parental-rules.htm, view-parental-activity.htm
view-parental-domains.htm                                                 domain-block rules
controller-ifstats.lua                                                    physical tab endpoint
view-dnslog.htm, view-networklog.htm, view-processes.htm                 Logs menu pages
view-syslog.htm, view-dmesg.htm                                          System / kernel log pages
menu.d/aw1000-logs.json                                                   Logs menu definition
view-srvlog.htm                                                           per-service log pages (Logs -> Services)
siem-forward, siem-send.lua, siem.init, config-siem                      SIEM log forwarding (syslog/HTTP, spool, LuCI)
controller-siem.lua, view-siem.htm                                        Services -> SIEM Forwarding page
dnscat-update                                                            nDPI category table updater
ndpi-categories.tsv, dnscat-custom.tsv                                   category seed data / overrides
build-ndpi-cats.py                                                       rebuild category seed from nDPI
dnslog-clear, dnslog-rotate                                               DNS log 12h clear / 20 MB rotate
controller-console.lua, deploy-console.sh                                 console vitals endpoint + theme deploy
aw1000-led, aw1000led.init, config-leds                                      LED controller (uplink-state LEDs, vendor daemon parked)
ocproxy/, build-ocproxy.sh, ocproxy.init, config-opencode                  OpenCode client proxy (Tools -> OpenCode)
controller-opencode.lua, view-opencode-overview.htm                        Tools -> OpenCode page
webview/, build-webview.sh, webview.init, config-webview                   link-rewriting web gateway (Tools -> Web Viewer)
webview/cgi/, build-wvcgi.sh                                                same-origin HTTPS bridge (/cgi-bin/webview)
controller-webview.lua, view-webview-overview.htm                          Tools -> Web Viewer page
controller-fileshares.lua, view-fileshares-overview.htm, config-fileshares   Tools -> File Shares (smbclient client)
controller-leds.lua, view-leds-overview.htm                                   System -> LED Configuration page (menu.d patched)
controller-theme.lua, view-theme-switch.htm                                System -> Theme flip between console and stock
theme-console/                                                             LuCI console theme source (CSS/JS/templates/fonts)
vendor/interfaces.js, vendor/physical-tab.js, vendor/patch-interfaces.py  vendor JS patch
wifi-guest, wifi-guest.init, 30-wifi-guest, config-wifi_guest    isolated guest bridge + saved VIF list
rollback.sh                                                               VPN rollback
wan-failover, wanfailover.init, config-wanfailover                        ISP/SIM uplink failover watchdog + seed
deploy-wanfailover.sh, update-wanfailover.sh, test-wanfailover2.sh        failover deploy / refresh / drill
rrun.sh                                                                   run a local script on the router via stdin
cloudflare-ddns.init, cloudflared.init                                    Cloudflare DDNS / tunnel services
controller-cloudflare.lua, view-cloudflare-ddns.htm, view-cloudflare-tunnels.htm
config-cloudflare                                                         UCI seed for /etc/config/cloudflare
build-ddns.sh, deploy-cloudflare.sh, dist/                                cross-built binaries + deploy
captiveportal.init, captiveportal-ctl, firewall.captiveportal             guest Wi-Fi portal service
captiveportal-hotplug (system/hotplug/30-captiveportal)                   refresh the accepted-address set on DHCP lease events
portal-index.html, portal-splash.cgi, portal-accept.cgi                   splash pages (CGI)
config-captiveportal, captiveportal.terms.txt                              portal settings + terms seed
controller-captiveportal.lua, view-captiveportal.htm                      Wireless -> Captive Portal page
controller-guestwireless.lua, view-guestwireless-{overview,devices,logs}.htm  Wireless -> Guest Wireless page
deploy-captiveportal.sh                                                   portal deploy
probe-*.sh, test-*.sh                                                     ad-hoc diagnostics (safe to delete)
```

## Changelog

- **2026-11-24** — **Uplink switch notifications.** `wan-failover` now tells
  the phone when it actually switches uplink (ISP ↔ SIM) instead of only
  logging it. Delivery is a Telegram bot message: `/usr/sbin/wan-notify`
  (`sim|isp`, `heartbeat`, `test`, `chatid`, `status`), config in
  `/etc/wan-notify.conf` (0600), token passed to curl through a temporary
  `--config` so it never reaches `argv`. The call is detached and retries 3×,
  so a slow API can never stall the probe loop; a 5-minute cooldown stops a
  flapping ISP from pinging every cycle and counts what it held back. The
  `init` path is silent, so a reboot does not notify. A daily `heartbeat`
  cron line acts as a dead-man's switch: no message = no router. The push also
  names the **public egress** address (asked from `cloudflare.com/cdn-cgi/trace`
  at send time): the carrier's NAT address on the SIM is not an interface
  address, so nothing local knows it. See §1d.

- **2026-11-24** — **Web viewer: escaped clicks fixed, no browsing record.**
  Clicking a link or a search result inside the viewer could land on the router
  itself (`404 Not Found` / `400 Bad Request`) because client-side JavaScript
  builds root-relative URLs the rewriter cannot see. The viewer now resolves
  such a path against the page the click came from (`Referer`/last page) and
  proxies it to that site; over HTTPS `ocgate` routes those paths back through
  the CGI bridge. Form targets were also wrong: the form action was rewritten
  twice, so a search/submit fetched `https://site/go?u=…` instead of the site's
  own URL, and POST forms lost their target completely — both fixed (GET uses a
  hidden field, POST puts `wv_u` in the action query, body untouched). `Refresh:`
  headers are rewritten, click-throughs send the real `Referer`/`Sec-Fetch-Site`
  upstream, and privacy is enforced: no URL logging or history, RAM-only
  sessions, `Cache-Control: no-store` and `Referrer-Policy: same-origin` on
  every response. `wvcgi`'s link prefixing is limited to `/go?` and `/raw?` so
  inline scripts are not mangled.

- **2026-11-24** — **Demo parity pass.** The static demo now has 56 views.
  Service Logs gained the missing **DHCP / DNS** and **SSH / Web** groups.
  **Status → Realtime Graphs** now has **Load / Traffic / Wireless /
  Connections** tabs. The ten vendor service menu entries are no longer only a
  summary table: each has its own view (OpenClash, Pass Wall, PassWall 2,
  SmartDNS, NextDNS, Tailscale, UPnP, Dynamic DNS, ShadowSocksR Plus+, uHTTPd).
  Updated `docs/demo/README.md`.

- **2026-11-24** — **Demo feature coverage.** The static demo now has 46 views.
  It keeps every custom page (Guest Wireless tabs, one-tap splash, parental
  scopes, Status shortcut, vendor log) and adds compact stock LuCI/vendor menu
  pages: Status Routes / Firewall / Realtime Graphs / WireGuard Status;
  Network DHCP and DNS / Hostnames / Static Routes / Diagnostics / Firewall /
  Switch; a Vendor Services overview; Sim Modem connection info and Lock Band;
  System Software / Startup / Backup / System / Mounts / Reboot / Scheduled
  Tasks / Administration / Time Synchronisation; Statistics Setup / Graphs; and
  Logs System Log / Kernel Log / Processes. Added matching screenshots and
  updated `docs/demo/README.md`. The Pages workflow now separates the build
  and deploy jobs and uses `upload-pages-artifact@v4`, avoiding the
  `deploy-pages@v4` same-run artifact lookup failure.

- **2026-11-23** — **Setup-first README and refreshed screenshots.** The
  README is now a short install-and-first-run guide: what the project is,
  hardware/firmware limits, backup, installer command, component switches,
  a first-run checklist, where to find each LuCI page, troubleshooting and
  security notes. All screenshots were recaptured from the current demo with
  the demo badge/banner hidden; added the one-tap guest splash, Guest Wireless
  Devices and Guest Wireless Logs images, and updated the screenshot index.

- **2026-11-23** — **Guest splash redesign, guest device scope, Status
  shortcut, Guest Wireless tabs.** The guest splash, success page and loading
  page now use the console palette with system fonts and inline SVG, are
  responsive, and open a session on one **Accept & continue** tap (no separate
  checkbox); the UAM fields and local/Cloudflare `accept_url` branches are
  unchanged. Acceptances append `ip`, `mac` and `vendor` (OUI lookup) to
  `/data/portal/accept.log`. **Parental Control → Devices & Activity** gains
  **All / LAN / Guest Wi-Fi** tabs (guest devices are classified from
  `192.168.5.0/24`, `br-guest` and the saved guest VIFs; Scan, Ports and
  Block/Unblock preserve the scope), and the same page is linked from
  **Status → Devices & Activity**. **Wireless → Guest Wireless** gains
  **Overview / Devices / Logs** tabs: Devices lists guests with
  Block/Unblock, and Logs shows guest acceptances with IP, MAC and vendor
  plus a raw-log download. The demo mirrors all of it.

- **2026-11-23** — **Guest Wireless page and log scopes.** **Wireless →
  Guest Wireless** turns the guest network and its captive portal on/off,
  shows the saved guest SSIDs, bridge/subnet, DHCP range and firewall state,
  and links back to the Wi-Fi editor. **DNS Log** and **Network Log** now have
  **All / LAN / Guest Wireless** scope tabs that split `192.168.5.0/24` /
  `br-guest` activity from the main LAN.

- **2026-11-23** — **Guest Wi-Fi checkbox.** The Wi-Fi Add/Edit form now has a
  **Guest network** checkbox. It moves the SSID's VIF to an isolated
  `br-guest` bridge (192.168.5.1/24) with its own DHCP/DNS range and
  `wifi_guest` firewall zone: internet only, no LAN, captive portal on
  `br-guest`. The main `br-lan` SSID is untouched. Saved guest VIFs are
  reattached at boot and after Wi-Fi reloads (`wifi_guest.main.ifaces` +
  `wifi-guest` service/hotplug + the `mtkwifi.lua` reload hook).

- **2026-11-23** — **Captive portal scoped to a network interface.** Enforcement
  now matches `-i <gate_iface>` (default `br-lan`) instead of building client
  sets from DHCP leases. Radios are bridged into `br-lan`, so the bridge is the
  unit iptables can match; the page lists matchable interfaces only and flags a
  legacy radio/bridge-member setting. The NAT redirect targets the gated
  interface's own IPv4 address (so a guest bridge on another subnet works) and
  the splash form posts back to the address the request arrived on. Accepted
  addresses are refreshed from `/proc/net/arp`; exempt MACs become per-MAC
  rules. The page was simplified to status + enable + interface selector, with
  page text, terms, port, session length and exemptions behind **Advanced
  settings**, and the activity tables collapsed under **Recent activity**.

- **2026-11-23** — **Wi-Fi pages explained.** The Wireless Overview, Add/Edit
  network and Device Configuration pages now show an info (i) icon next to
  each setting with a plain-language tooltip. Mode values are translated to
  Wi-Fi 4/5/6 names (for example `HE_5G mode` → **Wi-Fi 6 / 802.11ax ·
  5 GHz**), the network form labels SSID/security/password in plain language,
  and a short "most home networks only need…" note sits at the top. Shared
  assets: `vendor-patches/wifi-help.{css,js}`; patched templates:
  `mtk_wifi_{overview,vif_cfg,dev_cfg}.htm`.

- **2026-11-23** — **Local-only captive portal; simpler Wi-Fi form.** The
  external/Cudy portal mode was removed from the LuCI page, UCI config and
  enforcement script, and FreeRADIUS was stopped, disabled and uninstalled on
  the live router; only the local Wi-Fi MAC-gated portal remains. The vendor
  Wi-Fi **Add / Edit network** form now keeps SSID, security, key, hidden and
  mode visible and folds the hardware tuning fields behind **Show advanced
  settings** (`vendor-patches/patch-wifi-vif.py`).

- **2026-11-23** — **Interactive console demo.** A static, self-contained SPA
  under `docs/demo/` mirrors the console with fictional data: overview,
  interfaces and physical ports, parental rules and device activity, captive
  portal, Tools (Web Viewer / File Shares / OpenCode), Cloudflare, VPN split
  tunnel, SIEM, LEDs, DNS and service logs, and the SIM modem page. It uses the
  console stylesheet and fonts, a hash router and mock interactions; no router
  or API is contacted. `.github/workflows/pages.yml` deploys it to GitHub Pages,
  and `assets/data.js` is the entire dataset.

- **2026-11-22** — **SIM failover: recover from modem flight mode (CFUN=4).**
  An interrupted band-lock / 5G-mode change could leave the modem with the
  software radio ON but `CFUN=4` (RF off): the SIM never registered, so the
  watchdog saw the ISP outage, woke the SIM, and had no route to switch to.
  `wan-failover` now reads `AT+CFUN?` at startup and before every SIM wake and
  restores `CFUN=1` when it is 0 or 4; the 3ginfo **Lock Band** page restores
  `CFUN=1` on every radio-changing path and after a band-lock submit. Verified
  end to end: SIM default route in 2-3 s after the fail threshold, and with the
  new 3 s / 2-probe / 1 s-timeout cadence a full switch takes ~8 s each way
  (was ~30 s / ~20 s).

- **2026-11-20** — **Web Viewer through NordVPN, fail-open.** Viewer requests
  are marked `SO_MARK 0x2` by the binary and a policy rule sends them to table
  101, which holds a default route via `wgvpn` only while the WireGuard
  handshake is fresh (<180 s). If the tunnel is down the table is withdrawn and
  traffic falls through to the WAN — never blocked. Reconciled at boot, on
  ifup/ifdown, after every fw3 reload and by cron; the Status tab shows which
  path is in use. Verified: egress `198.51.100.10` (NordVPN) with the tunnel up,
  `203.0.113.10` (WAN) with table 101 flushed.

- **2026-11-20** — **Web Viewer page mirrors OpenCode.** Viewer / Status /
  Settings are tabs with the live frame first and auto-loaded (no "Load here"
  step). "Open full page" is a plain anchor rendered server-side for the current
  scheme (`/cgi-bin/webview/` on HTTPS, `:8090` on HTTP), so it is correct
  before scripts run. The status tab adds the same-origin bridge note and the
  settings moved into their own tab. Verified through the HTTPS bridge:
  searching in the embedded viewer returns the rewritten page.

- **2026-11-20** — **OpenCode page tabs; robust full-page link.** Session,
  Status and Connection are now tabs, with Session first. "Open full page"
  no longer calls `window.open` (popup blockers could swallow it) — it is a
  plain `target=_blank` anchor whose URL is rendered server-side for the
  current scheme (`https://<host>/?oc=1` on HTTPS, `http://<lan>:<port>/` on
  HTTP) and refreshed by the page's probe.

- **2026-11-20** — **Web Viewer over HTTPS.** The console's HTTPS page could
  not frame the plain-HTTP gateway (mixed content), so "Load here" showed a
  warning and the viewer was unusable remotely. A small CGI bridge (`wvcgi`,
  `/cgi-bin/webview`) now serves the viewer on the console's own origin: uhttpd
  runs the binary (directly on :80 or through `ocgate` on :443), which relays
  to `127.0.0.1:8090` and prefixes the viewer's `/go`/`/raw` URLs, so links,
  assets, forms, POSTs and the address bar stay inside the bridge. The LuCI
  page uses `https://<host>/cgi-bin/webview/` on HTTPS and the direct `:8090`
  gateway on HTTP. Works through the Cloudflare tunnel and its Access session;
  verified with a proxied page and a POST round trip.

- **2026-11-20** — **OpenCode over HTTPS.** The console's HTTPS page could not
  frame the plain-HTTP proxy (mixed content), so it told you to open HTTP.
  A TLS front door (`ocgate`) now serves the app on the console's own origin
  (`https://<host>/?oc=1`) with the router's existing certificate — no new
  exception — while proxying LuCI to uhttpd on :80. The SPA's paths
  (`/api`, `/assets`, `/session`, `/server`, ...) route to ocproxy with
  path-scoped `oc_gate` cookies, so LuCI is untouched. Verified over HTTPS:
  projects and sessions render in the LuCI frame with no warning.

- **2026-11-20** — **OpenCode: advertise the proxy address.** `/api/info`
  lists the server's own URLs (`127.0.0.1:<port>`, the host IP). A browser
  using the proxy cannot reach those, and the app reports that as “can't reach
  this server” even when the proxied API works. `ocproxy` now rewrites the
  `urls` field to the origin the client used, so the app only knows an address
  it can actually reach (verified: `urls: ["http://192.168.0.1:8091"]`, projects
  and sessions still render).

- **2026-11-20** — **Web Viewer: "Load here" works on every router address.**
  The frame was hardcoded to `http://<lan-ip>:8090/`, so opening the console
  over the WireGuard address (`10.0.0.4`) or a hostname clicked through to an
  empty error page — and the service only listened on the LAN IP. The page now
  builds the viewer URL from `location.hostname` (falling back to the LAN IP),
  probes it before revealing the frame, and prints the URL it tried when there
  is no answer. The iframe no longer starts with `src=""`, which made the
  browser load the LuCI page inside itself. The service now binds
  `0.0.0.0:<port>` like uhttpd/ocproxy; the WAN zone still drops the port.

- **2026-11-20** — **OpenCode frame: accurate reachability check.** The LuCI
  page probed `/__status` with a CORS fetch, which can fail on phones and made
  the page claim “the frame did not load” even when the UI was fine. The probe
  is now `no-cors` (any HTTP answer means reachable), tries the LAN IP first,
  and the generic checklist is suppressed on HTTPS pages where mixed-content,
  not reachability, is the real cause (the HTTPS warning covers that). The hint
  also prints the addresses it tried. `ocproxy` gained a watcher that re-pairs
  every 15 s while the server or tunnel is down, so the UI recovers on its own
  instead of showing “can’t reach this server” until someone presses Pair now.

- **2026-11-20** — **OpenCode: reachable on every router address, self-healing
  session.** `ocproxy` now listens on `0.0.0.0:<port>` instead of only the LAN
  IP, so a hostname, WireGuard address (`10.0.0.4`) or LAN IP all reach the UI;
  the WAN zone still drops the port. A 401 (server restart/password change)
  makes the proxy re-pair once and replay the request, verified by restarting
  the server and getting 200 on `/api/session` without touching the page. The
  LuCI page probes the host it was opened on and falls back to the LAN IP.

- **2026-11-20** — **Tools section.** Web Viewer, File Shares and OpenCode moved
  from **Network** to a new top-level **Tools** group between Network and
  Services (console rail order Status · Network · Tools · Wireless · Services…).
  Entry paths are now `admin/tools/{webview,fileshares,opencode}`; the pages,
  their JSON endpoints and the theme icon (`i-tools`, wrench) were updated. The
  rail filter keeps the group in `preferred` so it renders in that position.

- **2026-11-20** — **OpenCode client.** **Tools → OpenCode** pairs with an
  existing OpenCode server — password (`opencode serve`) or a one-time
  `opencode pair` / `opencode pair --remote` link — and reverse-proxies its web
  UI, API and WebSocket on the LAN (`/data/ocproxy/bin/ocproxy`, port 8091),
  so the whole app runs in a LuCI iframe with a server-side session cookie.
  Frame headers are stripped, redirects/cookies rewritten, and `Pair now`
  re-pairs after the server password changes. See §7d.

- **2026-11-20** — **Web viewer: address bar, bare hostnames.** Every proxied
  page now carries a fixed bar (home / back / URL / Go) so another URL can be
  entered without going back to the viewer home; it is injected after the
  rewrite pass. The URL field is a text input, so `ebay.co.uk` submits instead
  of tripping the browser's own "Please enter a URL" validation. Frames carry
  `&e=1` and render without the bar. Upstream error statuses show a banner.
- **2026-11-20** — **Web viewer fixes; web proxy removed.** The viewer now
  carries GET form fields to the target (search boxes), resolves missing or
  relative form actions, keeps `#fragments`, preserves the upstream charset,
  and no longer sends `X-Frame-Options` (it blocked the LuCI iframe). The
  LuCI page's "Load here" button had tested `iframe.src`, which returns the
  document URL when empty, so the frame never navigated — fixed. The earlier
  tinyproxy "Web Proxy" page/service/config/PAC was removed at the owner's
  request; `tinyproxy` is uninstalled.

- **2026-11-20** — **Web viewer + router storage.** **Tools → Web Viewer** is
  a link-rewriting gateway: the router fetches a URL, rewrites HTML/CSS links,
  forms, images and cookies, and serves it back, so the site sees the router's
  address. Static Go binary on `/data`, LAN port 8090, forms/cookies/redirects
  handled; JS-app pages render partially. **File Shares** gains router storage:
  a 1 GB drop-box on `/data/files` (100 MB per file), and SMB uploads now
  stage on `/data` instead of RAM, raising the per-file cap to 100 MB. See
  §7c and §8.

- **2026-11-20** — **File shares (SMB + router storage).** **Network → File
  Shares** lists, uploads, downloads, creates and deletes on SMB/CIFS shares
  through `smbclient`, with passwords in `/etc/fileshares.secrets` (0600),
  token-checked calls and 100 MB streamed transfers, plus a 1 GB drop box on
  the router (`/data/files`, 100 MB per file). Packages: `ca-bundle
  samba4-client`. See §8.
- **2026-11-20** — **Post-merge clean-up.** The upstream merge left three
  integration gaps that never reached a fresh install: the LED controller's
  `aw1000-led`, its `aw1000led` init script and the captive-portal DHCP hotplug
  were committed without the executable bit (the installer `chmod`s them, a
  plain copy from the repo did not); the installer's config backup skipped
  `/etc/config/leds`, so re-running it could not restore LED settings; and
  `docs/INSTALL.md` + `system/crontab` were missing `WITH_LEDS`, the `leds`
  backup entry and the `*/5 vpnsplit-warm` cron line. No behaviour changes.
- **2026-11-19** — **LED controller.** New `aw1000-led` service drives the
  router LEDs from the real uplink state (internet LED green when online,
  blinking + red fault LED when offline, Wi-Fi LED on radios up, SIM LED when
  the SIM is active). The firmware's LED daemon read the modem and showed the
  wrong internet state while the wired uplink carried the traffic, and it
  rewrote the LED triggers so the stock LED Configuration page never worked
  (this kernel has no netdev trigger at all). The controller parks the vendor
  daemon; **System → LED Configuration** now opens a working page with live
  LED state, settings and a test state. Disabling it hands the LEDs back.
  See §4b.
- **2026-11-19** — **Theme switcher.** New **System → Theme** page flips LuCI
  between the AW1000 Console theme (default) and the stock Bootstrap theme,
  with no reboot. The page renders in whichever theme is active — the console
  topbar gains a *Theme* button and the stock System menu lists the page — so
  the flip works in both directions. `admin/system/theme/set` is POST with the
  CSRF token only; the installer now always registers both
  `luci.themes.*` entries.
- **2026-11-19** — **Captive portal moved to Wireless + local mode.** The page
  is now **Wireless → Captive Portal** (`admin/mtk/captiveportal`), next to the
  Wi-Fi configuration. A new `mode` switch selects `external` (the Cudy owns
  the guest network, as before) or `local` (this router's own Wi-Fi is the
  guest network). Local mode gates Wi-Fi clients by MAC from the DHCP leases,
  DNATs HTTP to the splash on `192.168.0.1:8088`, rejects HTTPS until the terms
  are accepted, blocks IPv6 the same way, and opens a timed `portal_ok`
  session. A DHCP hotplug plus a one-minute cron keep the client sets fresh;
  `exempt` is a MAC allowlist for your own devices. The splash server now
  answers every path with the T&C page (`uhttpd -E`). See §5.
- **2026-11-19** — **Console review pass.** The rail now hides what LuCI
  publishes but nobody should click: the `ifstats`/`vitals` JSON endpoints, the
  vendor `test`/`webcmd`/`authcode` helpers, the dead `multi_ap`, `netmode` and
  Network → Wireless links (all 404), and the 30-page `telephony` trigger
  section. The URLs still work; they are just not advertised. The WAN strip's
  note reads `In use: ISP · stable 5h 12m` from a new `failover` block in the
  `vitals` JSON (state, since, probe count, SIM parked). Devices & Activity
  hides the Uploaded/Downloaded columns while every value is `—`, puts Ports and
  Block on one line, and stops `not managed` from wrapping. The Blocking Rules
  empty state no longer shows an empty Save & Apply bar. Interfaces no longer
  flashes the `( )` badge stack on load. Phones: the Theme switch is hidden
  below 620 px so the logout button is no longer clipped (the topbar overflowed
  by 10 px at 390 px on every page).
- **2026-11-19** — **SIEM log forwarding.** New `siem` service ships the syslog
  ring buffer, dnsmasq query log and captive-portal acceptances to an external
  SIEM. Collectors append to a capped spool (`/tmp/siem`, 4 MB, oldest-first
  drop) and a separate flusher delivers RFC5424/RFC3164 over UDP/TCP/TLS or
  JSON/Splunk HEC over HTTPS. Tokens stay in 0600 files and are handed to curl
  through `--config`, never argv. LuCI page under **Services → SIEM
  Forwarding** with a live queue/error strip and a *Send test event* button;
  installed disabled until an endpoint is configured. TLS syslog needs
  `openssl-util`. See §6.
- **2026-11-19** — **Console polish pass (critique follow-up).** DNS log:
  desktop overflow fixed (83 px → 0) with a scroll owner on the device table,
  card-per-device layout at ≤820 px, and one address + `+N` in the list (all
  addresses stay in the drill-down). Activity log renders a proper empty state
  instead of a black band. Interface cards use the console SVG sprite instead
  of the vendor 16 px rasters; radio speed reports `6.4 Gbit/s` instead of
  `63643 Mbit/s`. The page commit bar hides on the read-only Physical
  Interfaces tab. Captive Portal's Cudy setup is a collapsed `<details>`.
  Contrast: `--faint` 4.25:1 → 5.0:1, parked badge 4.34:1 → 5.3:1; rail links
  get the 2 px accent focus ring; Overview uses `span 6` at 821–1280 px.
  Backup: `/root/console-backup-<epoch>/` on the router.
- **2026-11-19** — **Console polish pass, part 2.** VPN Split Tunnel gains a live
  status strip (handshake age, `vpnset` size, table-100 route, rule counts) fed
  by a new `admin/network/vpnsplit/status` JSON endpoint. Wi-Fi radio cards are
  labelled **5 GHz / 2.4 GHz** from their channel; Disable and Reset are no
  longer styled as destructive. The Overview device count now uses the same
  DHCP + neighbour + FDB union as Devices & Activity, so the two numbers agree.
  The RADIUS shared secret is masked behind a Show toggle and no longer printed
  in the Cudy walkthrough. Login drops the redundant eyebrow and "Welcome back"
  for a plain **Sign in**. The Overview hero's System tile now reports **CPU
  usage** (interval delta from `/proc/stat`, 120 ms fallback sample) with memory
  and load in the foot; the mobile interface status wraps instead of overflowing
  the page by 42 px. The closed mobile drawer is `inert` (no invisible tab stops)
  and the login's second eyebrow is gone; the Domain Blocks empty state no
  longer tells you to "click" a button.
- **2026-11-19** — **Responsive sweep.** 17 further pages checked at 1440 and
  390. Stock LuCI div-tables (Firewall status, Routes, Startup, Software) now
  scroll inside their card instead of widening the page (worst case 534 px → 0),
  long firewall chain names wrap, and the per-rule hover tooltips that sat past
  the right edge are hidden on phones. All 34 page/viewport checks are now 0 px
  overflow.
- **2026-11-19** — **Replication + keyboard.** `install-remote.sh` now deploys
  `luci/model/cbi/vpnsplit/domains.lua`; a fresh install previously had no CBI
  model for the VPN page. The mobile drawer moves focus to its first link on
  open and back to the toggle on close (desktop focus is untouched).

- **2026-11-19** — **Uplink visibility.** The Overview page now has a **WAN
  interfaces** strip under the hero listing every interface in the firewall
  `wan` zone (ISP, SIM, SIM6) with proto, address and state; the active uplink
  is marked **In use** and named in the hero (`Internet · ISP`). Parked SIM
  interfaces are amber, not an error red. `vitals` now returns
  `wan.ifaces[]`, `wan.active` and `wan.active_label`. On **Network →
  Interfaces**, rows are ordered **ISP → SIM/SIM6 → other → WireGuard last**
  (`ifaceRank` in the patched `interfaces.js`).
- **2026-11-18** — **ISP/SIM uplink split.** The wired WAN port (`eth1`) is now
  a real DHCP interface `isp` and is the **primary** uplink; the 5G modem (`wan`,
  mipc, `ccmniX`) is **failover only**. The `wanfailover` watchdog parks the SIM
  while the ISP answers — `wan` is brought down (no PDP context, no SIM data),
  its IPv6 default/RA is suppressed, and only the ISP route remains. It probes
  every 10 s, wakes the SIM in ~2 s after 3 failed ISP probes, and parks it again
  ~20 s after the ISP recovers. Per-device metric slots (ISP 10/60, SIM 20/50)
  prevent `ip route replace` from clobbering the other path; a `from <isp-ip>`
  policy rule keeps DHCP renews on `eth1` during failover. Modem section stays
  `wan` because vendor binaries hardcode it; the UI labels it **SIM**/**SIM6**
  via `IFACE_LABELS` in `vendor/interfaces.js`. Overview hero + `vitals` report
  the active uplink; vnstat/collectd track `eth1`; `vpn.example.com`
  re-pointed at `<wan-ip>` automatically.
- **2026-11-18** — Guest Wi-Fi captive portal: splash/T&C page on
  `http://192.168.0.1:8088` (second uhttpd instance), acceptance log on `/data`,
  **Wireless → Captive Portal**, log under **Logs → Services → Captive Portal**.
  Cudy guest SSID uses the `Manual` profile pointing at that URL.
- **2026-11-18** — Cloudflare DDNS (`cloudflare-ddns` v1.18.0) and `cloudflared`
  2026.11.1 installed as procd services, with **Services → Cloudflare** pages.
  Binaries live on `/data/cloudflare/bin`, tokens in 0600 files. `vpn.example.com`
  is kept pointed at the WAN address automatically.
- **2026-11-18** — Logs menu expanded: DNS drill-down (IP/MAC/manufacturer),
  System/Kernel logs, Network Log and a working Processes page; Download/Copy
  buttons on every log page. DNS log cleared every 12 h.
- **2026-11-18** — DNS categories added: local nDPI table + editable
  `/data/dnscat/custom.tsv`, category badges, per-device top category and
  category filter. `/usr/sbin/dnscat-update` refreshes weekly.
- **2026-11-18** — new top-level **Logs** menu with **DNS Log** (moved from
  Status); DNS log now cleared every 12 h (00:00/12:00 UTC) and rotated at
  20 MB. Theme rail got a log icon (`menu-console3.js`).
- **2026-11-18** — WiFi restored to `<your-ssid>` on br-lan (WPA2PSK/AES, no
  AP isolation); guest network removed. DHCP on br-lan for WiFi only
  (wired DHCP blocked with ebtables).
- **2026-11-18** — router WiFi repurposed as isolated **Guest Wifi**
  (`br-guest` 192.168.5.0/24, DHCP, AP isolation), normal ISP internet only
  (no VPN), router management allowed on 22/80/443. Wired LAN DHCP disabled.
- **2026-11-17** — WireGuard split tunnel (NordVPN US), LuCI VPN page;
  parental control with schedules + usage sampling; Physical Interfaces tab.
- **Incident 2026-11-17** — a live test banned the admin PC's MAC; INPUT
  blocking cut SSH and the cleanup never ran. Recovered from another device.
  Fixes: SSH/HTTP returns in `PARENTAL`, `settings.exempt` list.
- **2026-11-18** — LuCI redesigned as **AW1000 Console**: custom theme
  (`luci.main.mediaurlbase=/luci-static/console`), dark rail + bone canvas,
  IBM Plex, live overview hero/vitals endpoint, mobile drawer, form/table/card
  system, login page, realtime graph recolour. Fixed sidebar 404s (missing
  `admin` URL segment). Source in `theme-console/`; rollback:
  `uci set luci.main.mediaurlbase='/luci-static/bootstrap'`.
- **2026-11-18** — Parental blocked-domain rules (per device + global) added
  by the parallel workstream; console theme preserves and styles both fields.
