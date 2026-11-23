# Install / replication guide

This guide takes a stock **AW1000_Ultra (vendor OpenWrt 19.07.7)** from zero to
the same build. It is written for a second device: every credential, hostname
and client-specific value is a placeholder.

Order matters. Steps 1–3 are required; 4–7 are per feature.

---

## 0. Preflight

On the router, confirm the platform before changing anything:

```sh
cat /tmp/sysinfo/model            # AW1000_Ultra
cat /etc/openwrt_release          # 19.07.7, mt6890/evb6890v1_64_cpe
df -h /overlay /data             # /data must exist (user_data partition)
command -v ipset conntrack ebtables curl uci
```

Confirm you can get back in if a rule misbehaves: SSH on 22 and plain HTTP on 80
are deliberately left unblocked by the parental chain. Keep a second LAN device
handy.

Take a configuration backup:

```sh
mkdir -p /root/backup-$(date +%s)
cp /etc/config/* /root/backup-$(date +%s)/
```

---

## 1. Packages

Required (most are already present on this image):

```sh
opkg update
opkg install ipset conntrack ebtables iptables-mod-conntrack-extra \
             iptables-mod-extra iptables-mod-filter iptables-mod-ipopt \
             iptables-mod-iprange curl
```

Optional:

```sh
# SMB file shares (the web viewer ships as a static binary)
opkg install ca-bundle samba4-client

# Statistics graphs
opkg install collectd collectd-mod-cpu collectd-mod-interface collectd-mod-iwinfo \
             collectd-mod-load collectd-mod-memory collectd-mod-rrdtool \
             luci-app-statistics

# Interface throughput history
opkg install vnstat

# TLS syslog for SIEM forwarding (not needed for HTTP/HTTPS or TCP/UDP)
opkg install openssl-util
```

See [`../install/packages.txt`](../install/packages.txt).

---

## 2. Run the installer

From the machine that holds this repo:

```sh
# key-based auth
ROUTER=root@192.168.0.1 ./install/install.sh

# password auth: pass it through the environment, never in a file
SSHPASS='…' ROUTER=root@192.168.0.1 ./install/install.sh
```

What it does, in order:

1. `tar` the payload to `/tmp/aw1000-install` on the router.
2. Back up `/etc/config/{network,firewall,dhcp,luci,parental,vpnsplit,wanfailover,cloudflare,captiveportal,siem,system,leds}`
   to `/root/aw1000-backup-<epoch>/`.
3. Install files with correct modes (scripts `0755`, templates/data `0644`).
4. Seed `/etc/config/<name>` **only if the file does not exist**.
5. Register the fw3 includes (`firewall.parental`, `firewall.vpnsplit`,
   `firewall.captiveportal`, `firewall.dhcpwifi`).
6. Merge cron entries (no duplicates).
7. Enable + restart the services.
8. Activate the theme and clear the LuCI caches.

Component switches:

| Variable | Default | Effect |
|---|---|---|
| `WITH_THEME` | 1 | Theme assets, console controller, theme switcher page, `luci.main.mediaurlbase` |
| `WITH_PARENTAL` | 1 | Rules engine, LuCI pages, cron |
| `WITH_LOGS` | 1 | Logs menu, DNS log, categories, OUI DB, LAN/Guest log scopes |
| `WITH_WANFAILOVER` | 1 | Watchdog service (uplink config still manual) |
| `WITH_LEDS` | 1 | LED controller driven from the uplink state; parks the vendor LED daemon |
| `WITH_VPNSPLIT` | 1 | ipset/mark split tunnel (WireGuard peer still manual) |
| `WITH_CAPTIVEPORTAL` | 1 | Splash server, pages, fw3 include |
| `WITH_CLOUDFLARE` | 1 | DDNS/tunnel services + LuCI (binaries must exist) |
| `WITH_SIEM` | 1 | Log forwarder, LuCI page, `/etc/config/siem` seed (disabled until configured) |
| `WITH_VENDOR_PATCHES` | 1 | Drop in patched vendor JS and Wi-Fi pages (help icons, friendly mode names, simplified network form, guest network checkbox, Guest Wireless page) |
| `WITH_BOOTSTRAP_PATCHES` | 0 | Patch the stock Bootstrap theme's menu-title escaping (only useful when not using the console theme) |
| `ACTIVATE_THEME` | 1 | Point `luci.main.mediaurlbase` at the console theme |

Example: theme + parental only.

```sh
WITH_LOGS=0 WITH_WANFAILOVER=0 WITH_VPNSPLIT=0 WITH_CAPTIVEPORTAL=0 \
WITH_CLOUDFLARE=0 ./install/install.sh
```

> The installer never writes a password, key or token. If a token file is
> missing the dependent service simply logs "not starting" — configure it in
> LuCI afterwards.

---

## 3. LuCI cache

Lua controllers are cached. After any controller change:

```sh
rm -rf /tmp/luci-modulecache /tmp/luci-indexcache
/etc/init.d/uhttpd restart
```

The browser also caches vendor JS and the menu tree (`sessionStorage`). Log out
and back in, or open a new tab.

---

## 4. Uplink: wired WAN primary, 5G failover

**Not automated** — it changes `network`, `dhcp` and `firewall`, and the WAN
port name can differ between units. Do it from LuCI or by hand.

Target state:

| | Primary | Standby |
|---|---|---|
| UCI interface | `isp` | `wan` (vendor-fixed name) |
| Device | `eth1` | `ccmniX` (mipc, changes per dial) |
| Protocol | `dhcp` | `mipc` |
| UCI metric (fallback) | 40 | 50 |
| Runtime metric | 10 up / 60 down | 20 up / 50 down |

```sh
# wired WAN
uci set network.isp=interface
uci set network.isp.proto='dhcp'
uci set network.isp.ifname='eth1'
uci set network.isp.metric='40'
uci set network.isp.peerdns='1'
uci set network.isp.defaultroute='1'
uci commit network

# SIM stays "wan" — vendor binaries hardcode network.wan / network.wan6
uci set network.wan.metric='50'
uci set network.wan.dns_metric='50'
uci commit network

# no DHCP service on the WAN side
uci set dhcp.isp=dhcp
uci set dhcp.isp.interface='isp'
uci set dhcp.isp.ignore='1'
uci commit dhcp

# isp joins the existing wan firewall zone
ZONE=$(uci show firewall | sed -n "s/^firewall\.\([^.]*\)\.name='wan'$/\1/p" | head -1)
uci add_list "firewall.$ZONE.network=isp"
uci commit firewall

/etc/init.d/network reload
/etc/init.d/wanfailover enable
/etc/init.d/wanfailover restart
```

Verify with the drill in [`../AGENTS.md`](../AGENTS.md) §1c, or run:

```sh
cat /tmp/wanfailover.status
ip route show default
```

> The SIM section **must stay named `wan`**. `atcid`, `/etc/init.d/mipc_wan.init`
> and `EasyMesh_openwrt.sh` hardcode `network.wan` and will create a second mipc
> interface if it disappears. The UI relabels it via `IFACE_LABELS` in the
> patched `interfaces.js`.

---

## 5. Split-tunnel WireGuard peer

The scripts are installed; the peer is yours to create (it contains a private
key, so it is not in this repo).

```sh
uci set network.wgvpn=interface
uci set network.wgvpn.proto='wireguard'
uci set network.wgvpn.private_key='<PRIVATE_KEY>'
uci set network.wgvpn.addresses='10.5.0.2/32'
uci set network.wgvpn.mtu='1420'
uci commit network

uci set network.wgpeer=wireguard_wgvpn
uci set network.wgpeer.public_key='<PEER_PUBLIC_KEY>'
uci set network.wgpeer.endpoint_host='<vpn-endpoint>'
uci set network.wgpeer.endpoint_port='51820'
uci set network.wgpeer.persistent_keepalive='25'
uci set network.wgpeer.route_allowed_ips='0'
uci add_list network.wgpeer.allowed_ips='0.0.0.0/0'
uci commit network
```

Add the zone/forwarding exactly once:

```sh
uci set firewall.vpnzone=zone
uci set firewall.vpnzone.name='vpn'
uci set firewall.vpnzone.network='wgvpn'
uci set firewall.vpnzone.input='REJECT'
uci set firewall.vpnzone.output='ACCEPT'
uci set firewall.vpnzone.forward='REJECT'
uci set firewall.vpnzone.masq='1'
uci set firewall.vpnzone.mtu_fix='1'
uci set firewall.vpnfwd=forwarding
uci set firewall.vpnfwd.src='lan'
uci set firewall.vpnfwd.dest='vpn'
uci commit firewall
```

Then choose the interface (`Network → VPN Split Tunnel`) and add domains/IPs.
The service writes the dnsmasq `ipset` lines itself; do not add them twice.
On start it also **deletes** `dhcp.@dnsmasq[0].ipset` and `.server` and rebuilds
them from `/etc/config/vpnsplit`, so keep hand-written entries out of those two
lists. Start it once the peer exists:

```sh
/etc/init.d/vpnsplit restart
```

Verification: add a known single-service IP, then

```sh
curl --resolve ipinfo.io:443:<IP> https://ipinfo.io/ip
```

must return the VPN exit address. Remove the test entry afterwards.

---

## 6. Cloudflare binaries

Not shipped (50 MB). Either cross-build or download the release:

```sh
# cloudflared (aarch64, static)
curl -L -o dist/cloudflared-linux-arm64 \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64

# cloudflare-ddns v1.18.0 (favonia), cross-compiled for arm64
GOOS=linux GOARCH=arm64 go build -trimpath -o dist/cloudflare-ddns ./cmd/ddns
```

Copy them to `/data/cloudflare/bin/` (overlay is small):

```sh
mkdir -p /data/cloudflare/bin
cp cloudflared-linux-arm64 /data/cloudflare/bin/cloudflared
cp cloudflare-ddns        /data/cloudflare/bin/cloudflare-ddns
chmod 755 /data/cloudflare/bin/*
ln -sf /data/cloudflare/bin/cloudflared     /usr/bin/cloudflared
ln -sf /data/cloudflare/bin/cloudflare-ddns /usr/bin/cloudflare-ddns
```

Then, **in LuCI** (`Services → Cloudflare`), paste the API token and any tunnel
connector token. They are written to `/etc/cloudflare-ddns.token` and
`/etc/cloudflare-tunnel-<section>.token`, mode 0600, never to argv or the
environment.

If `cloudflare.doh` fails with a certificate mismatch on this firmware, use
`cloudflare.trace` as the IP4 provider (this is the default in the seed).

---

## 7. Captive portal

Portal files go to `/www/portal`, the service listens on the configured port
(default 8088) with a **second uhttpd instance**; LuCI keeps port 80. The page
is under **Wireless → Captive Portal**.

```sh
/etc/init.d/captiveportal enable
/etc/init.d/captiveportal restart
curl -s http://<router>:8088/ | head
```

This router's own Wi-Fi is the guest network. The portal is scoped to one
**network interface** (`captiveportal.main.gate_iface`, default `br-lan`):
traffic entering the router on that interface is redirected to the splash and
blocked until the client accepts. The radios (`ra0`/`rai0`) are bridged into
`br-lan`, so select the bridge — iptables cannot match a bridged radio
directly. On the stock setup `br-lan` also carries the wired ports, so
selecting it gates those too. Router management stays reachable.

```sh
uci set captiveportal.main.gate_iface='br-lan'
uci set captiveportal.main.exempt='aa:bb:cc:dd:ee:ff'
uci commit captiveportal
/usr/sbin/captiveportal apply
/usr/sbin/captiveportal status
```

`exempt` is a space-separated MAC allowlist for devices that must never see the
portal; it is compiled into per-MAC rules and works on every gated interface.
Selecting `br-lan` gates its wired ports as well (they share the bridge);
use a dedicated guest bridge if wired clients must stay outside the portal.
Accepted guests share the LAN after accepting — use a dedicated guest
interface if you need isolation.

Accepted terms are logged to `/data/portal/accept.log`
(`time | ip | mac | country | target | user-agent | vendor`), capped by the
service. View them with IP, MAC and vendor under
**Wireless → Guest Wireless → Logs**.

If the router is behind a NAT that cannot reach `192.168.0.1:8088`, publish a
tunnel hostname to that port instead (Cloudflare tunnel → `http://192.168.0.1:8088`).

### Guest Wi-Fi

The Wi-Fi Add/Edit form has a **Guest network** checkbox. It moves that SSID's
VIF to `br-guest` (192.168.5.1/24), adds a `wifi_guest` firewall zone
(internet only, no LAN) and serves DHCP 192.168.5.100-249 from the main
dnsmasq via `/tmp/dnsmasq.d/wifi-guest.conf`. Tick it on each band you want
isolated; the main SSID stays on `br-lan`. The helper files are
`system/sbin/wifi-guest`, `system/init.d/wifi-guest`,
`system/hotplug/30-wifi-guest` and `uci/wifi_guest`; no extra packages are
needed. The captive portal should use `captiveportal.main.gate_iface='br-guest'`
so it gates the guest bridge rather than the main LAN.

**Wireless → Guest Wireless** has **Overview / Devices / Logs** tabs. Overview
turns the guest network and its captive portal on/off, lists the saved guest
SSIDs and shows the bridge/subnet, DHCP range and firewall state. Devices lists
current guests with Block/Unblock; Logs shows captive-portal acceptances with
IP, MAC and vendor. The SSID list is still set by the **Guest network** checkbox
in Wi-Fi configuration. **DNS Log** and **Network Log** have **All / LAN /
Guest Wireless** scope tabs; the guest scope is `192.168.5.0/24` / `br-guest`.


---

## 7b. SIEM forwarding

The forwarder is installed but **disabled**. Configure it in
**Services → SIEM Forwarding**, then send a test event before enabling the
service in production.

Syslog (Wazuh, Graylog, rsyslog, QRadar, a syslog-ng relay):

| Field | Typical value |
|---|---|
| Transport | Syslog |
| Host / port | `siem.example.com` / `6514` (TLS), `601` (TCP) or `514` (UDP) |
| Format | RFC5424 |
| Facility | `local0` (or whatever the collector maps) |
| TLS verification | on, unless the collector uses a private/self-signed CA |

UDP and TCP syslog use `lua` + `luci-lib-nixio` (already installed with LuCI)
so each message stays one datagram and the flusher never waits for a UDP
reply; if those are missing it falls back to BusyBox `nc`. TLS syslog needs
the `openssl-util` package:

```sh
opkg install openssl-util
```

Splunk HTTP Event Collector:

| Field | Value |
|---|---|
| Transport | HTTP / HTTPS collector |
| URL | `https://splunk.example.com:8088/services/collector/event` |
| Payload format | Splunk HEC envelope |
| Auth header | `Authorization`, scheme `Splunk` |
| Token | paste the HEC token (stored in `/etc/siem.token`, mode 0600) |

Non-interactive equivalent (syslog/TLS):

```sh
uci set siem.settings.enabled='1'
uci set siem.target.transport='syslog'
uci set siem.target.host='siem.example.com'
uci set siem.target.port='6514'
uci set siem.target.proto='tls'
uci commit siem
/etc/init.d/siem enable
/etc/init.d/siem restart
```

Verification, from the router:

```sh
/usr/sbin/siem-forward test
/usr/sbin/siem-forward status
logread -e siem | tail
```

`test` bypasses the queue and prints `ok:` or the transport error. The LuCI
page has the same button and a live status strip. Then tick **Forwarder
enabled**, save, and confirm the counter and *Last success* advance on the
collector side.

Defaults: sources `syslog dns`; spool `/tmp/siem` (RAM, 4 MB cap). Set the spool
to `/data/siem` to survive reboots — that writes to eMMC, so it is off by
default. When the cap is reached the **oldest** events are dropped and counted;
delivery is at-least-once.

If the collector is only reachable through the tunnel, remember the router
dials **out**, so no firewall input rule is required.

> Privacy: DNS queries and captive-portal acceptances contain client IP/MAC,
> hostnames and user agents. Untick a source if that data must not leave the
> device.

---

## 8. Verify

```sh
# services
for s in vpnsplit wanfailover captiveportal cloudflare-ddns cloudflared siem wifi-guest; do
  printf '%-16s ' "$s"; /etc/init.d/$s enabled && echo enabled || echo disabled
done

# state
cat /tmp/wanfailover.status
cat /tmp/parental.status
cat /tmp/siem.status 2>/dev/null || true
ipset list vpnset | head -5
ip route show table 100
iptables -S PARENTAL
crontab -l

# data dirs
ls -l /data/logs /data/dnscat /data/oui /data/portal
```

Click through every page, in a real browser: the vendor LuCI returns HTTP 200
for templates that render nothing.

- Overview (hero, uplink chip, client count)
- Network → Interfaces → **Physical Interfaces**
- Network → Parental Control → Rules / Devices & Activity / Domain Blocks
- Network → VPN Split Tunnel
- Services → Cloudflare → Dynamic DNS / Tunnels
- Wireless → Captive Portal
- Services → SIEM Forwarding (status strip, Save, Send test event)
- Logs → DNS Log / Services → each / System Log / Kernel Log / Network Log / Processes

---

## 9. Rollback

```sh
# theme: System → Theme in the UI, or
uci set luci.main.mediaurlbase='/luci-static/bootstrap'; uci commit luci

# a service
/etc/init.d/<name> disable; /etc/init.d/<name> stop

# config files
cp /root/aw1000-backup-<epoch>/* /etc/config/
reload_config
```

Remove a fw3 include with `uci show firewall | grep include`, then delete the
matching section and `uci commit firewall && /etc/init.d/firewall reload`.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Sidebar links 404 | `menu-console.js` built URLs without the `admin` mode segment | Use the shipped file; it calls `L.url("admin", …)` |
| LuCI 500 after editing a controller | Lua syntax/`end` bug | Check `/tmp/luci-*` cache cleared, read the traceback in the page or `logread` |
| Menu entry missing | menu tree cached in `sessionStorage` | Log out / new tab |
| Parental rule silently not saved | vendor CBI TypedSection does not send the create marker | Use the custom HTML form in the shipped templates |
| `Unknown error (STOPPED)` on the parked SIM | netifd code with no vendor message | Expected; the patched `interfaces.js` shows "Parked — standby…" |
| Portal save does nothing | all inputs must be inside the `<form>`; parent nodes need `.leaf` only on handlers | Keep the shipped template |
| DDNS never updates | wrong provider (`cloudflare.doh` TLS-mismatch here) | Use `cloudflare.trace` |
| DNS log empty | `logqueries` off or `logfacility` not a path | `dhcp.@dnsmasq[0].logqueries=1`, `logfacility=/data/logs/dns.log` |
| SIEM test fails with `openssl missing` | TLS syslog chosen without the binary | `opkg install openssl-util`, or use TCP/HTTP |
| SIEM queue grows while test fails | collector unreachable or rejecting | Check *Last error*; 5xx, 408/429 and 401/403 are retried; other 4xx drops the batch when `drop_on_4xx=1` |
| SIEM receives everything twice | spool on `/data` after a crash, or `syslog_backfill=1` | At-least-once is expected; leave backfill off and use the SIEM's dedup |
