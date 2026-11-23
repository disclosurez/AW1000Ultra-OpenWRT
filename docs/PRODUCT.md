# PRODUCT.md — AW1000 Console

## Product

A private router console for a single household network: an AW1000 Ultra 5G CPE
running a vendor OpenWrt 19.07.7 fork at `192.168.0.1`. The console is LuCI,
reached over the LAN by the owner from a desktop browser or a phone.

It is not a commercial product. There is one operator, who also administers the
VPN split tunnel, parental controls, DNS logging and the home WireGuard link.

## Who uses it

**The owner-operator.** Technical, knows what a MAC address is, runs Proxmox and
Home Assistant on the LAN, reads logs. Uses the console in short, purposeful
sessions:

- "Is the internet up, and what is the WAN address?"
- "Who is on the network right now?"
- "Block the kids' tablets until 21:00."
- "Send this one domain through the US VPN."
- "Why did the firewall drop that?"

They are usually at a 1440 px desktop, occasionally on a phone while standing
next to the router. They value density, accuracy and speed over hand-holding.

## Jobs

1. **Orient** — see WAN health, local device count, Wi-Fi, VPN and load at a
   glance, then drill into the exact page.
2. **Operate** — change interfaces, firewall, DHCP, VPN, parental rules, Wi-Fi
   without fighting the form.
3. **Verify** — confirm a change took effect and see the current state without
   re-reading a wall of tables.
4. **Read** — inspect logs, leases, routes and process lists in monospace data
   views that do not wrap into soup.

## Surfaces

All authenticated LuCI pages, plus the login page. Third-party app pages
(PassWall, OpenClash, SmartDNS) keep their own internal layout; the shell and
shared LuCI controls are themed around them.

Custom surfaces that must feel native to the theme:

- Status → Overview (dashboard)
- Network → Interfaces → Physical Interfaces
- Network → VPN Split Tunnel
- Network → Parental Control → Blocking Rules / Devices & Activity

## Constraints

- OpenWrt 19.07.7, LuCI Bootstrap-era markup (`.cbi-*`, `.table`, `.ifacebox`).
- aarch64, ~144 MB overlay with limited free space: no heavy frameworks, no
  icon fonts, no large images.
- No build step on the router. Plain CSS/JS/templates only. Must survive a
  browser refresh and the router's `fw3 reload` / service restarts.
- The router is the network's only gateway. A broken console must never remove
  the ability to recover over SSH (port 22) or plain HTTP (port 80).
- The UI must work in current Chrome, Edge, Firefox and Safari, including
  keyboard-only use.
- No fake telemetry. Every number shown must come from the router.

## Success

- Every standard LuCI page and every custom page renders correctly at 1440 px,
  1024 px and 390 px widths.
- The overview answers "is it healthy?" in one screen, with live WAN throughput.
- Forms are easy to scan, fields align, destructive actions are unmistakable.
- Login is usable and looks like the same product as the console.
- No console errors, no horizontal overflow, visible focus states, AA contrast.

## Non-goals

- Replacing LuCI's dispatch, ACL or form engine.
- Changing network behaviour, firewall policy or credentials.
- Re-theming third-party application internals beyond the shared chrome.
- A marketing site, onboarding wizard or multi-user roles.
