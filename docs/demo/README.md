# Interactive demo

A static, self-contained mock of the AW1000 Console. It uses the same theme
stylesheet and fonts as the router, but every address, device, rule and event
is fictional and no network request is made to a router.

Open `index.html` through any static web server:

```sh
cd docs/demo
python3 -m http.server 8111
# http://127.0.0.1:8111/
```

The GitHub Actions workflow deploys this directory to GitHub Pages on every
push to `main`.

## What it covers

The demo has **56 views**. It mirrors the custom pages and the stock menu
pages that a real installation exposes:

- **Custom console:** Overview (live hero, WAN strip, a **Thermals** card with
  a SoC gauge, 6 h sparkline and per-zone chips, and a **Speed tests** card
  whose Run buttons replay a mock speedtest), Interfaces / Physical ports,
  Parental Control (rules, domains, devices and scopes), Status → Devices &
  Activity, Guest Wireless (Overview / Devices / Logs), one-tap Captive Portal
  splash preview, Cloudflare, SIEM, VPN split tunnel, LED Configuration,
  Theme, Sim Modem, Web Viewer, File Shares and OpenCode.
- **Logs:** DNS Log with categories and scopes, Network Log, Service Logs with
  nine filter groups (including DHCP / DNS and SSH / Web), System Log, Kernel
  Log and Processes.
- **Stock LuCI/vendor pages:** Status Routes / Firewall / Realtime Graphs
  (Load / Traffic / Wireless / Connections tabs) / WireGuard Status; Network
  DHCP and DNS / Hostnames / Static Routes / Diagnostics / Firewall / Switch;
  a Vendor Services overview plus individual pages for OpenClash, Pass Wall,
  PassWall 2, SmartDNS, NextDNS, Tailscale, UPnP, Dynamic DNS, ShadowSocksR
  Plus+ and uHTTPd; Sim Modem connection info and Lock Band; System Software /
  Startup / Backup / System / Mounts / Reboot / Scheduled Tasks /
  Administration / Time Synchronisation; and Statistics Setup / Graphs.

Every view uses mock data and mock interactions; changing something in the
demo never changes a router. All 56 views are reachable from the sidebar.

## Files

- `assets/data.js` — core fictional dataset
- `assets/demo.js` — hash router, views, mock interactions and compact
  stock-page data
- `assets/demo.css` — demo shell, cards, tables and tool views
- `assets/cascade.css` — the console theme stylesheet
- `assets/fonts/` — IBM Plex (latin subset)

The real source for the router pages, services and installer is in the
repository root; see `AGENTS.md` and `docs/INSTALL.md`.
