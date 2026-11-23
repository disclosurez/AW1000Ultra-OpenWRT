# DESIGN.md — AW1000 Console

## Visual world

**Bench instrument.** A router console that reads like a well-made piece of
network equipment: matte graphite chassis, a bone-white work surface, hairline
rules, monospaced measurements, one calm jade signal. It is quiet where nothing
is happening and precise where data matters. No glassmorphism, no neon, no
illustrated mascots, no gradient buttons.

The dark rail is the chassis. The light canvas is the panel you read. The two
never blend into one another; the boundary is a crisp 1 px line.

Mode: **Operate** for every authenticated page, with a **Read** sub-mode for
logs and leases. Login is a single **Persuade**-grade first impression: it sets
the world in one viewport without overselling a router.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--rail` | `#0E1412` | sidebar chassis |
| `--rail-2` | `#151E1A` | rail hover / raised row |
| `--rail-line` | `#222E29` | rail hairlines |
| `--rail-ink` | `#E8EFEA` | rail primary text |
| `--rail-muted` | `#8D9B94` | rail secondary text |
| `--canvas` | `#F4F5F1` | app background |
| `--card` | `#FFFFFF` | panels |
| `--ink` | `#121916` | headings, primary text |
| `--ink-2` | `#3D4944` | body text |
| `--muted` | `#66736D` | descriptions, labels |
| `--faint` | `#626C67` | metadata |
| `--line` | `#E2E6DE` | card borders, dividers |
| `--line-2` | `#EEF1EA` | inner row dividers |
| `--accent` | `#0E7A6E` | primary action, active nav, links |
| `--accent-ink` | `#0A5A52` | accent text on soft fills |
| `--accent-soft` | `#E4F1ED` | active tint |
| `--ok` | `#147A57` | up / healthy |
| `--ok-soft` | `#E2F2EA` | healthy tint |
| `--warn` | `#8F5508` | attention |
| `--warn-soft` | `#FAEFDB` | attention tint |
| `--danger` | `#BC3A2E` | destructive, blocked |
| `--danger-soft` | `#FBE9E6` | destructive tint |

Radii: 16 px for the hero, 14 px cards, 9 px controls, 99 px pills.
Spacing: 4 px base; 8/12/16/20/24/32.
Shadow: `0 1px 2px rgba(14,20,18,.05), 0 18px 40px -32px rgba(14,20,18,.35)`.
Never use inner shadows or bevels.

## Type

Self-hosted, latin subset, `woff2`, loaded with `font-display: swap`.

- **IBM Plex Sans** 400–600 — one technical superfamily for page titles, card
  titles, body and controls. Tight tracking (`-0.025em`) on display sizes.
- **IBM Plex Mono** 400/500 — IPs, MACs, ports, timings, byte counts, logs.
  Use `font-variant-numeric: tabular-nums` everywhere numbers align.

Micro-labels: 10 px, 600, uppercase, `letter-spacing: .11em`, muted. Never use
them for sentences.

Chinese/other glyphs fall back to `system-ui, "Noto Sans", sans-serif`; the
layout must not depend on webfont metrics.

## Layout

- Sidebar 264 px fixed; collapses to 76 px on desktop; off-canvas drawer below
  1080 px.
- Topbar 64 px, sticky, `background: rgba(244,245,241,.86)`, 1 px bottom rule,
  backdrop blur 10 px. Holds the section crumb, live WAN chip, LuCI indicators,
  logout.
- Canvas max-width 1240 px, padding 26 px 34 px 72 px.
- Tabs sit above the page title as a single segmented rail.
- Page title (h2) is the only h1-level element; the crumb names the section, so
  the page title is never repeated.
- Cards stack in one column by default; the overview uses a 12-column grid.

## Components

**Rail nav.** Sections are groups with an icon, label and chevron. Only the
active group is expanded on first paint; groups remember their state. Active
child uses accent text plus a 2 px left mark. Collapsed rail shows icons with
native tooltips, and clicking a group re-expands the rail.

**Topbar.** Crumb: section name only, linked to its first page. Right side:
Internet chip (dot + `Online`/`Offline` + WAN IPv4), LuCI indicators as small
pills, logout as a ghost button. On mobile the crumb becomes the page title and
the chip loses the IP.

**Overview hero.** Dark panel, 2 columns: WAN identity and a live 60-point
RX/TX sparkline on the left; four linked stat tiles (LAN devices, Wi-Fi, VPN,
System) on the right. Big WAN address in mono. Status dot pulses only while
online. No invented values; skeleton placeholders until data arrives.

**WAN interfaces strip.** Full-width white card directly below the hero. One
chip per WAN-zone interface (ISP, SIM, SIM6): state dot, label, proto, address
and a state badge. The active uplink carries the jade **In use** badge and
tinted background; a parked SIM is amber (**Parked**); a dead link is red.

**Cards.** White, 1 px `--line`, 14 px radius, 22 px padding. Section title 15 px
IBM Plex Sans. Field rows use a 220 px label column and hairline separators.

**Forms.** Labels above values in the field column, 13 px medium ink-2. Inputs
36 px, 9 px radius, white, 1 px line; focus is accent border + 3 px 14 % ring.
Selects keep a custom chevron. Inline validation is red text plus red border,
never a tooltip-only signal.

**Buttons.** 34 px high, 12.5 px/600. Primary: accent fill, white text. Secondary:
white with line border. Destructive: white with danger text/border, fills danger
on hover. Add actions use a dashed border. Icon-only buttons are 30×30 with an
`aria-label` and a visible focus ring.

**Tables.** Header row 10 px uppercase muted on `#F7F8F3`; rows separated by
1 px `--line-2`; 12 px vertical padding; hover `#FAFBF7`; numeric cells mono,
right-aligned when they are measurements. On narrow screens the card scrolls
horizontally rather than crushing columns.

**Status vocabulary.** Pill with dot: `up` (ok), `down` (danger), `warn`,
`idle` (neutral). Text always accompanies colour (`Up`, `Down`, `Blocked`,
`Allowed`). Blocked/allowed states never rely on red/green alone.

**Empty states.** One short headline, one sentence, one action. No illustrations
of routers, no exclamation-mark triangles.

**VPN status strip.** Four-cell hairline grid above the split-tunnel form: handshake age, split-set size, table-100 route, rule counts. Values carry semantic colour (ok / warn / danger); labels are micro-caps.

**Login.** Split screen: graphite panel (brand, hostname, model, firmware, LAN
address, signal motif drawn with CSS) and bone form panel (title, two fields,
full-width primary, inline error). At 720 px the panel becomes a compact header
above the form.

## Motion

- Page content fades/rises 4 px over 180 ms on load.
- Rail expand/collapse 180 ms ease; drawer 220 ms.
- Sparkline samples every 5 s, transition 400 ms linear.
- Hover/press transitions 120 ms.
- Respect `prefers-reduced-motion: reduce`: no pulse, no transforms, instant
  state changes.

## Voice

Plain, specific, unexcited. "WAN address", "LAN devices", "2 rules · 1 blocked".
No exclamation marks, no "Oops!", no anthropomorphism. Error copy names the
field and the fix. Timestamps use the router clock (UTC) and say so when it
matters.

## Do / don't

- Do use mono for anything that is an address, identifier or measurement.
- Do keep one accent; status colours are semantic, never decorative.
- Do let whitespace separate groups before adding borders.
- Don't use gradients on controls, shadows on text, or rounded everything.
- Don't duplicate the page title in the crumb and the h2.
- Don't hide state behind colour alone or behind hover only.
