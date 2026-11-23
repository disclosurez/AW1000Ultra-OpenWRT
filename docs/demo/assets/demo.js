(function () {
	'use strict';

	const DATA = window.DEMO_DATA;
	const state = JSON.parse(JSON.stringify(DATA));
	state.openPorts = {};
	state.fileshares.browse = null;
	state.dnsFilter = '';

	const $ = (s, r = document) => r.querySelector(s);
	const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
	const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"></use></svg>`;
	const href = (id, params) => '#/' + id + (params ? '?' + new URLSearchParams(params).toString() : '');
	const badge = (text, tone = '') => `<span class="demo-badge ${tone}">${esc(text)}</span>`;
	const th = (label, cls = '') => `<th${cls ? ` class="${cls}"` : ''}>${label}</th>`;
	const td = (content, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${content}</td>`;
	const btn = (label, action, opts = {}) => {
		const attrs = Object.entries(opts.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
		return `<button type="button" class="btn${opts.primary ? ' btn-primary' : ''}${opts.cls ? ' ' + opts.cls : ''}" data-action="${action}"${attrs}>${label}</button>`;
	};

	function kv(rows) {
		return `<div class="demo-kv">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
	}
	function meter(label, value, pct, tone = '') {
		return `<div class="demo-meter"><div class="demo-meter-head"><span>${label}</span><b>${value}</b></div><div class="demo-meter-bar"><i class="${tone}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`;
	}
	function card(title, body, note = '') {
		return `<section class="demo-card">${title ? `<h3>${title}${note ? ` <span class="demo-card-note">${note}</span>` : ''}</h3>` : ''}${body}</section>`;
	}
	function table(headers, rows, opts = {}) {
		if (!Array.isArray(rows)) rows = [];
		return `<div class="demo-table-wrap"><table class="demo-table${opts.cls ? ' ' + opts.cls : ''}"><thead><tr>${headers.join('')}</tr></thead><tbody>${rows.map(r => {
			if (typeof r === 'string') return `<tr>${r}</tr>`;
			const cells = Array.isArray(r) ? r : r.cells;
			const attrs = Array.isArray(r) ? '' : (r.attrs || '');
			return `<tr${attrs}>${cells.map(c => String(c).startsWith('<td') ? c : td(c)).join('')}</tr>`;
		}).join('')}</tbody></table></div>`;
	}
	function empty(title, text, iconId = 'i-grid') {
		return `<div class="demo-empty">${icon(iconId)}<b>${title}</b><span>${text}</span></div>`;
	}
	function pageHead(title, desc, actions = '') {
		return `<div class="demo-page-head"><div><h2>${title}</h2>${desc ? `<p class="demo-desc">${desc}</p>` : ''}</div>${actions ? `<div class="demo-actions">${actions}</div>` : ''}</div>`;
	}
	function tabbar(base, items, active) {
		return `<ul class="tabs">${items.map(([id, label]) => `<li class="${id === active ? 'active' : ''}"><a href="${href(base, { tab: id })}">${label}</a></li>`).join('')}</ul>`;
	}
	function field(label, input, hint = '', cls = '') {
		return `<div class="cbi-value${cls ? ' ' + cls : ''}"><label class="cbi-value-title">${label}</label><div class="cbi-value-field">${input}${hint ? `<div class="cbi-value-description">${hint}</div>` : ''}</div></div>`;
	}
	function checkbox(name, label, checked) {
		return `<label class="demo-check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${label}</label>`;
	}
	function modalActions(cancel = 'Cancel', save = 'Save', saveAction = '') {
		return `<div class="demo-form-actions"><button type="button" class="btn" data-action="__close">${cancel}</button>${saveAction ? `<button type="button" class="btn btn-primary" data-action="${saveAction}">${save}</button>` : `<button type="submit" class="btn btn-primary">${save}</button>`}</div>`;
	}


  const SERVICE_LOG_LABELS = {
    system: 'System log', cloudflare: 'Cloudflare', captive: 'Captive portal',
    parental: 'Parental control', vpn: 'VPN and uplink', firewall: 'Firewall',
    siem: 'SIEM forwarding', dhcpdns: 'DHCP / DNS', sshweb: 'SSH / Web'
  };

  /* ------------------------------------------------------- stock pages */
  function ekv(rows) {
    return kv(rows.map(([k, v]) => [esc(k), esc(v)]));
  }
  function etable(headers, rows) {
    return table(headers.map(h => th(esc(h))), rows.map(r => r.map(v => td(esc(String(v))))));
  }

  /* The router's menu also exposes stock LuCI/vendor pages. These compact
     mock views keep the demo aligned with the real navigation. */
  const STOCK_PAGES = {
    'status-routes': {
      group: 'status', label: 'Routes', title: 'Routes',
      desc: 'Active IPv4/IPv6 routes and policy rules.',
      cards: [
        { title: 'IPv4 routes', note: 'main table', table: { headers: ['Destination', 'Gateway', 'Metric', 'Interface'], rows: [
          ['0.0.0.0/0', '203.0.113.1', '10', 'eth1'],
          ['203.0.113.0/24', '—', '0', 'eth1'],
          ['192.168.1.0/24', '—', '0', 'br-lan'],
          ['192.168.5.0/24', '—', '0', 'br-guest'],
          ['10.0.0.0/24', '—', '0', 'wghome']
        ] } },
        { title: 'Policy rules', table: { headers: ['Priority', 'Rule', 'Table'], rows: [
          ['100', 'fwmark 0x1', '100 · wgvpn'],
          ['101', 'fwmark 0x2', '101 · webview'],
          ['200', 'from 203.0.113.10', '201 · isp']
        ] } }
      ]
    },
    'status-firewall': {
      group: 'status', label: 'Firewall', title: 'Firewall Status',
      desc: 'Live iptables chains, policies and counters.',
      cards: [
        { title: 'Filter chains', table: { headers: ['Chain', 'Policy', 'Packets', 'Comment'], rows: [
          ['INPUT', 'ACCEPT', '12,441', 'SSH and LuCI exempt'],
          ['FORWARD', 'DROP', '48,202', 'zones + PARENTAL'],
          ['PARENTAL', '—', '1,204', 'device rules'],
          ['PORTAL_FWD', '—', '312', 'guest splash gate'],
          ['OUTPUT', 'ACCEPT', '9,830', 'router traffic']
        ] } },
        { title: 'Zones', table: { headers: ['Zone', 'Input', 'Forward', 'Masquerade'], rows: [
          ['lan', 'ACCEPT', 'ACCEPT', 'no'],
          ['wan', 'REJECT', 'REJECT', 'yes'],
          ['wifi_guest', 'REJECT', 'REJECT', 'yes'],
          ['wghome', 'ACCEPT', 'ACCEPT', 'yes']
        ] } }
      ]
    },
    'realtime': {
      group: 'status', label: 'Realtime Graphs', title: 'Realtime Graphs',
      desc: 'Live load, memory, traffic and wireless rates.',
      cards: [
        { title: 'Current load', meters: [
          ['Load 1 min', '0.68', 23, ''],
          ['Load 5 min', '0.62', 21, ''],
          ['Load 15 min', '0.58', 19, ''],
          ['CPU usage', '14%', 14, ''],
          ['Memory', '54%', 54, '']
        ] },
        { title: 'Traffic', kv: [
          ['WAN RX', '2.4 Mbit/s'], ['WAN TX', '480 kbit/s'],
          ['br-lan RX', '18.2 MB/s'], ['br-lan TX', '4.1 MB/s'],
          ['Poll interval', '5 s']
        ] }
      ]
    },
    'wireguard': {
      group: 'status', label: 'WireGuard Status', title: 'WireGuard Status',
      desc: 'WireGuard interfaces, peers and handshakes.',
      cards: [
        { title: 'Interfaces', table: { headers: ['Interface', 'Address', 'Port', 'Peers', 'State'], rows: [
          ['wghome', '10.0.0.4/32', '51820', '1', 'up'],
          ['wgvpn', '10.100.0.2/32', '51821', '1', 'up']
        ] } },
        { title: 'Peers', table: { headers: ['Interface', 'Endpoint', 'Allowed IPs', 'Handshake', 'Transfer'], rows: [
          ['wghome', '192.0.2.20:51820', '10.0.0.0/24', '12 s ago', '18.4 MB / 3.1 MB'],
          ['wgvpn', '198.51.100.10:51820', '0.0.0.0/0 (policy)', '12 s ago', '112 MB / 14.2 MB']
        ] } }
      ]
    },
    'dhcp': {
      group: 'network', label: 'DHCP and DNS', title: 'DHCP and DNS',
      desc: 'dnsmasq leases, DNS forwarders and local domain settings.',
      cards: [
        { title: 'Settings', kv: [
          ['LAN DHCP range', '192.168.1.100 – 192.168.1.249'],
          ['Guest DHCP range', '192.168.5.100 – 192.168.5.249'],
          ['Lease time', '12 h'],
          ['DNS forwarders', '203.0.113.53, 203.0.113.54'],
          ['Local domain', 'lan']
        ] },
        { title: 'Active leases', table: { headers: ['Hostname', 'IP', 'MAC', 'Lease'], rows: [
          ['living-room-tv', '192.168.1.21', '02:00:00:00:00:21', '11 h 42 m'],
          ['kids-tablet', '192.168.1.22', '02:00:00:00:00:22', '9 h 18 m'],
          ['guest-phone', '192.168.5.42', '02:00:00:00:00:99', '3 h 52 m']
        ] } }
      ]
    },
    'hosts': {
      group: 'network', label: 'Hostnames', title: 'Hostnames',
      desc: 'Static hostname and DNS entries.',
      cards: [
        { title: 'Static entries', table: { headers: ['Hostname', 'IP address', 'MAC address', 'Source'], rows: [
          ['nas', '192.168.1.55', '02:00:00:00:00:55', 'static'],
          ['printer', '192.168.1.66', '02:00:00:00:00:66', 'static'],
          ['router', '192.168.1.1', '—', 'local']
        ] } }
      ]
    },
    'static-routes': {
      group: 'network', label: 'Static Routes', title: 'Static Routes',
      desc: 'Manually configured routes on the router.',
      cards: [
        { title: 'IPv4 static routes', table: { headers: ['Interface', 'Target', 'Gateway', 'Metric'], rows: [
          ['wghome', '10.0.0.0/24', '—', '0'],
          ['br-guest', '192.168.5.0/24', '—', '0']
        ] } }
      ]
    },
    'diagnostics': {
      group: 'network', label: 'Diagnostics', title: 'Diagnostics',
      desc: 'Ping, traceroute and DNS lookup tools.',
      cards: [
        { title: 'Connectivity', kv: [
          ['Ping 203.0.113.1', '4 packets, 0% loss, 8.2 ms'],
          ['Ping example.com', '4 packets, 0% loss, 14.7 ms'],
          ['Traceroute', '3 hops to 203.0.113.1'],
          ['NS lookup', 'example.com → 203.0.113.10']
        ] },
        { title: 'Note', kv: [['Live results', 'Mock values in this demo']] }
      ]
    },
    'net-firewall': {
      group: 'network', label: 'Firewall', title: 'Firewall',
      desc: 'Zones, forwarding and traffic rules.',
      cards: [
        { title: 'Zone policies', table: { headers: ['Zone', 'Input', 'Output', 'Forward', 'Networks'], rows: [
          ['lan', 'ACCEPT', 'ACCEPT', 'ACCEPT', 'lan'],
          ['wan', 'REJECT', 'ACCEPT', 'REJECT', 'wan wan6 isp'],
          ['wifi_guest', 'REJECT', 'ACCEPT', 'REJECT', 'guest'],
          ['wghome', 'ACCEPT', 'ACCEPT', 'ACCEPT', 'wghome']
        ] } },
        { title: 'Guest rules', table: { headers: ['Rule', 'Source', 'Destination', 'Action'], rows: [
          ['Allow DNS/DHCP', 'wifi_guest', 'router', 'ACCEPT'],
          ['Allow portal', 'wifi_guest', 'router:8088', 'ACCEPT'],
          ['Guest to WAN', 'wifi_guest', 'wan', 'ACCEPT'],
          ['Guest to LAN', 'wifi_guest', 'lan', 'REJECT']
        ] } }
      ]
    },
    'switch': {
      group: 'network', label: 'Switch', title: 'Switch',
      desc: 'MT7531 switch VLAN and port state.',
      cards: [
        { title: 'VLANs', table: { headers: ['VLAN', 'CPU', 'LAN1', 'LAN2', 'LAN3', 'LAN4'], rows: [
          ['1', 'tagged', 'untagged', 'untagged', 'untagged', 'untagged'],
          ['2', 'tagged', 'off', 'off', 'off', 'off']
        ] } },
        { title: 'Port state', table: { headers: ['Port', 'Link', 'Speed', 'Rx', 'Tx'], rows: [
          ['LAN1', 'up', '1 Gbit/s', '2.4 MB/s', '480 KB/s'],
          ['LAN2', 'down', '—', '0', '0'],
          ['LAN3', 'up', '100 Mbit/s', '112 KB/s', '38 KB/s'],
          ['LAN4', 'down', '—', '0', '0']
        ] } }
      ]
    },
    'vendor-services': {
      group: 'services', label: 'Vendor Services', title: 'Vendor Services',
      desc: 'Other services shipped with the vendor firmware.',
      cards: [
        { title: 'Installed service pages', note: 'status is mocked', table: { headers: ['Service', 'Menu', 'State', 'Purpose'], rows: [
          ['OpenClash', 'Services → OpenClash', 'disabled', 'transparent proxy'],
          ['PassWall', 'Services → Pass Wall', 'disabled', 'proxy policy'],
          ['PassWall 2', 'Services → PassWall 2', 'disabled', 'proxy policy'],
          ['SmartDNS', 'Services → SmartDNS', 'disabled', 'DNS forwarding'],
          ['NextDNS', 'Services → NextDNS', 'disabled', 'cloud DNS'],
          ['Tailscale', 'Services → Tailscale', 'disabled', 'mesh VPN'],
          ['UPnP', 'Services → UPnP', 'disabled', 'port mapping'],
          ['Dynamic DNS', 'Services → Dynamic DNS', 'disabled', 'legacy DDNS'],
          ['ShadowSocksR Plus+', 'Services → ShadowSocksR', 'disabled', 'proxy client'],
          ['uHTTPd', 'Services → uHTTPd', 'running', 'web server']
        ] } }
      ]
    },
    'modem-info': {
      group: 'modem', label: 'Connection info', title: '3G/4G/5G Information',
      desc: 'Vendor 3ginfo-lite modem details. Sensitive identifiers are withheld.',
      cards: [
        { title: 'Radio', kv: [
          ['Registration', 'Registered (roaming)'], ['Operator', 'Example Mobile'],
          ['Technology', '5G NSA'], ['Band', 'n78 · 3.5 GHz'],
          ['Signal', '78%'], ['Temperature', '42 °C'],
          ['IMEI / IMSI / ICCID', 'withheld']
        ] },
        { title: 'PDP context', kv: [
          ['APN', 'internet.example'], ['Interface', 'wan'],
          ['Device', 'ccmni3'], ['IPv4', '198.51.100.23'],
          ['Gateway', '198.51.100.1'], ['DNS', '198.51.100.53, 198.51.100.54']
        ] }
      ]
    },
    'lockband': {
      group: 'modem', label: 'Lock Band', title: 'Lock Band',
      desc: 'Band and 5G-mode selection for the SIM modem.',
      cards: [
        { title: 'Current selection', kv: [
          ['Radio state', 'CFUN=1 · full functionality'],
          ['Preferred mode', '5G NSA / LTE'],
          ['Locked band', 'n78 · 3.5 GHz'],
          ['SIM role', 'standby for ISP uplink']
        ] },
        { title: 'Available bands', table: { headers: ['Band', 'Technology', 'Selected'], rows: [
          ['n78', '5G NR · 3.5 GHz', 'yes'],
          ['B3', 'LTE · 1800 MHz', 'no'],
          ['B7', 'LTE · 2600 MHz', 'no'],
          ['B20', 'LTE · 800 MHz', 'no']
        ] } }
      ]
    },
    'software': {
      group: 'system', label: 'Software', title: 'Software',
      desc: 'Installed packages and opkg status.',
      cards: [
        { title: 'Package state', kv: [
          ['opkg', 'available'], ['Architecture', 'aarch64_cortex-a53'],
          ['Installed packages', '412'], ['Updates', '0']
        ] },
        { title: 'Key packages', table: { headers: ['Package', 'Version', 'Role'], rows: [
          ['luci', '19.07.7', 'web UI'],
          ['dnsmasq', '2.80', 'DHCP/DNS'],
          ['hostapd', 'vendor', 'Wi-Fi'],
          ['wireguard-tools', '1.0.20200513', 'VPN'],
          ['curl', '7.66.0', 'HTTP client'],
          ['samba4-client', '4.10', 'File Shares']
        ] } }
      ]
    },
    'startup': {
      group: 'system', label: 'Startup', title: 'Startup',
      desc: 'procd init scripts and boot order.',
      cards: [
        { title: 'Enabled services', table: { headers: ['Service', 'Order', 'State'], rows: [
          ['network', '10', 'enabled'], ['dnsmasq', '20', 'enabled'],
          ['firewall', '30', 'enabled'], ['uhttpd', '50', 'enabled'],
          ['wanfailover', '60', 'enabled'], ['wifi-guest', '70', 'enabled'],
          ['captiveportal', '80', 'enabled'], ['vpnsplit', '90', 'enabled'],
          ['siem', '95', 'disabled']
        ] } }
      ]
    },
    'flash': {
      group: 'system', label: 'Backup / Flash', title: 'Backup / Flash Firmware',
      desc: 'Configuration backup and firmware image handling.',
      cards: [
        { title: 'Backup', kv: [
          ['Config backup', '/root/aw1000-backup-<epoch>/'],
          ['Firmware image', 'not included in this demo'],
          ['Overlay used', '23 MB of 144 MB'],
          ['Keep settings', 'enabled']
        ] },
        { title: 'Warning', kv: [['Flashing', 'Never flash vendor firmware from this demo']] }
      ]
    },
    'system-settings': {
      group: 'system', label: 'System', title: 'System',
      desc: 'Hostname, language, time zone and logging.',
      cards: [
        { title: 'General', kv: [
          ['Hostname', 'AW1000-Ultra'], ['Model', 'AW1000 ULTRA'],
          ['Time zone', 'UTC'], ['Language', 'English'],
          ['Log buffer', '2 MB RAM'], ['Theme', 'AW1000 Console']
        ] }
      ]
    },
    'mounts': {
      group: 'system', label: 'Mount Points', title: 'Mount Points',
      desc: 'Filesystems and storage on the router.',
      cards: [
        { title: 'Mounted filesystems', table: { headers: ['Filesystem', 'Mount point', 'Size', 'Used'], rows: [
          ['overlayfs:/overlay', '/', '144 MB', '23 MB'],
          ['/dev/mmcblk0pX', '/data', '8.5 GB', '1.2 GB'],
          ['tmpfs', '/tmp', '512 MB', '18 MB'],
          ['devtmpfs', '/dev', '256 MB', '—']
        ] } }
      ]
    },
    'reboot': {
      group: 'system', label: 'Reboot', title: 'Reboot',
      desc: 'Reboot the router. A reboot interrupts the whole LAN for 1–2 minutes.',
      cards: [
        { title: 'Before rebooting', kv: [
          ['Active uplink', 'ISP · eth1'], ['SIM', 'parked'],
          ['Active portal sessions', '2'], ['Recommended', 'reboot only when asked']
        ] }
      ]
    },
    'crontab': {
      group: 'system', label: 'Scheduled Tasks', title: 'Scheduled Tasks',
      desc: 'cron entries installed by the overlay.',
      cards: [
        { title: 'Cron lines', table: { headers: ['Schedule', 'Command'], rows: [
          ['* * * * *', '/usr/sbin/parental-control apply'],
          ['*/3 * * * *', '/usr/sbin/parental-acct'],
          ['*/15 * * * *', '/usr/sbin/parental-domains refresh'],
          ['*/5 * * * *', '/usr/sbin/vpnsplit-warm'],
          ['*/30 * * * *', '/usr/sbin/dnslog-rotate'],
          ['0 */12 * * *', '/usr/sbin/dnslog-clear'],
          ['* * * * *', '/usr/sbin/captiveportal sync']
        ] } }
      ]
    },
    'admin': {
      group: 'system', label: 'Administration', title: 'Administration',
      desc: 'Router password, SSH access and HTTPS settings.',
      cards: [
        { title: 'Access', kv: [
          ['Root password', 'set'], ['SSH', 'enabled on port 22'],
          ['SSH keys', '1 installed'], ['LuCI HTTP', 'port 80'],
          ['LuCI HTTPS', 'port 443 via ocgate'], ['CSRF token', 'required for changes']
        ] }
      ]
    },
    'ntpc': {
      group: 'system', label: 'Time Synchronisation', title: 'Time Synchronisation',
      desc: 'NTP client and local clock.',
      cards: [
        { title: 'Clock', kv: [
          ['Local time', '2026-11-24 09:12 UTC'], ['NTP server', '203.0.113.123'],
          ['Sync state', 'in sync'], ['Router clock', 'UTC']
        ] }
      ]
    },
    'statistics-setup': {
      group: 'statistics', label: 'Setup', title: 'Statistics Setup',
      desc: 'collectd plugins and RRD storage.',
      cards: [
        { title: 'collectd', kv: [
          ['Data directory', '/tmp/rrd (RAM)'],
          ['Interval', '30 s'],
          ['Plugins', 'cpu, load, memory, interface, iwinfo'],
          ['Interfaces', 'br-lan, eth1, ccmni1, wgvpn, wghome']
        ] },
        { title: 'Graphs', kv: [['Renderer', 'LuCI statistics graphs'], ['History', 'RAM only, lost on reboot']] }
      ]
    },
    'graphs': {
      group: 'statistics', label: 'Graphs', title: 'Statistics Graphs',
      desc: 'Mock RRD-style graphs for load, CPU, memory and interfaces.',
      cards: [
        { title: 'System', meters: [
          ['CPU', '14%', 14, ''], ['Load', '0.68', 23, ''],
          ['Memory', '54%', 54, ''], ['Active connections', '601 / 16384', 4, '']
        ] },
        { title: 'Interfaces', meters: [
          ['br-lan RX', '18.2 MB/s', 61, ''], ['br-lan TX', '4.1 MB/s', 14, ''],
          ['eth1 RX', '2.4 Mbit/s', 12, ''], ['eth1 TX', '480 kbit/s', 5, ''],
          ['wgvpn', '12 s handshake', 88, '']
        ] }
      ]
    },
    'syslog': {
      group: 'logs', label: 'System Log', title: 'System Log',
      desc: 'logd ring buffer. Download or copy the visible lines.',
      cards: [
        { title: 'Recent messages', note: '2 MB RAM ring', log: [
          '2026-11-24 09:12:01 daemon.info dnsmasq[1234]: DHCPACK(br-guest) 192.168.5.42 02:00:00:00:00:99 guest-phone',
          '2026-11-24 09:11:44 user.notice wanfailover: ISP probe ok, SIM parked',
          '2026-11-24 09:10:22 daemon.info captive-portal: accepted ip=192.168.5.42 mac=02:00:00:00:00:99 vendor=Example Phone',
          '2026-11-24 09:08:15 user.notice parental: applied 2 rules',
          '2026-11-24 09:05:02 daemon.info hostapd: rai1: STA 02:00:00:00:00:99 associated',
          '2026-11-24 09:00:00 daemon.info crond[1234]: USER root pid 4321 cmd /usr/sbin/parental-control apply'
        ] }
      ]
    },
    'dmesg': {
      group: 'logs', label: 'Kernel Log', title: 'Kernel Log',
      desc: 'Kernel ring buffer (dmesg).',
      cards: [
        { title: 'Recent kernel messages', note: 'boot + link events', log: [
          '[    0.000000] Linux version 4.19.190 (vendor)',
          '[    2.114201] mt7531: switch0 port 0 link up (1000M/full)',
          '[    4.882310] br-lan: port 1(ra0) entered forwarding state',
          '[    5.104882] br-guest: port 1(ra1) entered forwarding state',
          '[   18.224011] ccmni3: PDP context activated',
          '[  420.991204] eth1: link up (1000M/full)',
          '[ 1284.221015] wgvpn: handshake with peer 1 complete'
        ] }
      ]
    },
    'processes': {
      group: 'logs', label: 'Processes', title: 'Processes',
      desc: 'Mock top-style process list. The stock Processes page is empty on this firmware, so this view is custom.',
      cards: [
        { title: 'Running processes', note: 'top -b -n1', table: { headers: ['PID', 'User', 'CPU', 'MEM', 'Command'], rows: [
          ['1', 'root', '0%', '1%', '/sbin/procd'],
          ['1234', 'root', '2%', '3%', '/usr/sbin/dnsmasq'],
          ['2210', 'root', '1%', '4%', '/usr/sbin/uhttpd -f -h /www'],
          ['2288', 'root', '0%', '2%', '/usr/sbin/wan-failover'],
          ['2301', 'root', '0%', '2%', '/usr/sbin/parental-control'],
          ['2412', 'root', '1%', '6%', '/data/ocproxy/bin/ocproxy'],
          ['2504', 'root', '0%', '3%', '/data/webview/bin/webview'],
          ['2601', 'root', '0%', '1%', '/usr/sbin/crond']
        ] } }
      ]
    }
  };

  /* Individual vendor-service pages, generated from the dataset. */
  state.vendorServices.forEach(s => {
    STOCK_PAGES[s.id] = {
      group: 'services', label: s.label, title: s.title,
      desc: s.desc, cards: s.cards
    };
  });

  const STOCK_NAV = {};
  Object.keys(STOCK_PAGES).forEach(id => {
    const g = STOCK_PAGES[id].group;
    if (!STOCK_NAV[g]) STOCK_NAV[g] = [];
    STOCK_NAV[g].push({ id, label: STOCK_PAGES[id].label });
  });

  function stockView(id) {
    const p = STOCK_PAGES[id];
    return {
      title: p.title,
      render() {
        let out = pageHead(esc(p.title), esc(p.desc || ''));
        (p.cards || []).forEach(c => {
          let body = '';
          if (c.kv) body += ekv(c.kv);
          if (c.meters) body += c.meters.map(m => meter(esc(m[0]), esc(m[1]), m[2], m[3] || '')).join('');
          if (c.table) body += etable(c.table.headers, c.table.rows);
          if (c.log) body += `<div class="demo-log">${c.log.map(l => `<span class="demo-log-line">${esc(l)}</span>`).join('') || 'No entries.'}</div>`;
          out += card(esc(c.title), body, esc(c.note || ''));
        });
        return out;
      }
    };
  }

	/* ------------------------------------------------------------- shell */
	const NAV = [
		{ id: 'status', label: 'Status', icon: 'i-gauge', items: [
			{ id: 'overview', label: 'Overview' },
			{ id: 'parental-activity', label: 'Devices & Activity' },
			...(STOCK_NAV.status || [])
		] },
		{ id: 'network', label: 'Network', icon: 'i-network', items: [
			{ id: 'interfaces', label: 'Interfaces' },
			{ id: 'parental', label: 'Parental Control' },
			{ id: 'vpnsplit', label: 'VPN Split Tunnel' },
			...(STOCK_NAV.network || [])
		] },
		{ id: 'tools', label: 'Tools', icon: 'i-tools', items: [
			{ id: 'webview', label: 'Web Viewer' },
			{ id: 'fileshares', label: 'File Shares' },
			{ id: 'opencode', label: 'OpenCode' }
		] },
		{ id: 'wireless', label: 'Wireless', icon: 'i-wifi', items: [
			{ id: 'wifi', label: 'WiFi configuration' },
			{ id: 'guest', label: 'Guest Wireless' },
			{ id: 'captive', label: 'Captive Portal' }
		] },
		{ id: 'services', label: 'Services', icon: 'i-grid', items: [
			{ id: 'cloudflare', label: 'Cloudflare' },
			{ id: 'siem', label: 'SIEM Forwarding' },
			...(STOCK_NAV.services || [])
		] },
		{ id: 'modem', label: 'Sim Modem', icon: 'i-signal', items: [
			{ id: 'modem', label: 'Status' },
			...(STOCK_NAV.modem || [])
		] },
		{ id: 'system', label: 'System', icon: 'i-sliders', items: [
			{ id: 'leds', label: 'LED Configuration' },
			{ id: 'theme', label: 'Theme' },
			...(STOCK_NAV.system || [])
		] },
		{ id: 'statistics', label: 'Statistics', icon: 'i-chart', items: [
			...(STOCK_NAV.statistics || [])
		] },
		{ id: 'logs', label: 'Logs', icon: 'i-log', items: [
			{ id: 'dnslog', label: 'DNS Log' },
			{ id: 'networklog', label: 'Network Log' },
			{ id: 'logs', label: 'Service Logs' },
			...(STOCK_NAV.logs || [])
		] }
	];
	const NAV_INDEX = {};
	NAV.forEach(g => g.items.forEach(it => { NAV_INDEX[it.id] = { group: g.id, label: it.label, groupLabel: g.label }; }));

	let actions = {};
	let forms = {};
	let currentRoute = { id: 'overview', params: new URLSearchParams() };

	function buildNav() {
		$('#topmenu').innerHTML = NAV.map(g => `<li class="nav-group" data-group="${g.id}">
			<button type="button" class="nav-head" aria-expanded="false">
				${icon(g.icon, 'icon nav-icon')}
				<span class="nav-label">${g.label}</span>
				${icon('i-chevron', 'icon nav-chev')}
			</button>
			<ul class="nav-sub">${g.items.map(it => `<li class="nav-leaf" data-leaf="${it.id}"><a href="${href(it.id)}">${it.label}</a></li>`).join('')}</ul>
		</li>`).join('');
		$$('.nav-head', $('#topmenu')).forEach(head => {
			head.addEventListener('click', () => {
				const group = head.closest('.nav-group');
				if (document.documentElement.classList.contains('rail-collapsed')) {
					document.documentElement.classList.remove('rail-collapsed');
					try { localStorage.setItem('demo.rail', 'open'); } catch (e) {}
					const toggle = $('#rail-toggle');
					if (toggle) { toggle.setAttribute('aria-label', 'Collapse sidebar'); toggle.setAttribute('title', 'Collapse sidebar'); }
					group.classList.add('is-open');
					head.setAttribute('aria-expanded', 'true');
					return;
				}
				const open = group.classList.toggle('is-open');
				head.setAttribute('aria-expanded', open ? 'true' : 'false');
			});
		});
	}
	function updateNav(routeId) {
		const info = NAV_INDEX[routeId] || { group: 'status' };
		$$('.nav-group', $('#topmenu')).forEach(group => {
			const active = group.dataset.group === info.group;
			group.classList.toggle('is-active', active);
			group.classList.toggle('is-open', active);
			const head = $('.nav-head', group);
			if (head) head.setAttribute('aria-expanded', active ? 'true' : 'false');
		});
		$$('.nav-leaf', $('#topmenu')).forEach(leaf => {
			leaf.classList.toggle('is-active', leaf.dataset.leaf === routeId);
		});
	}
	function closeMobileNav() {
		const app = $('#app');
		if (!app) return;
		app.classList.remove('nav-open');
		$('#scrim').hidden = true;
		document.body.classList.remove('nav-locked');
		const toggle = $('#nav-toggle');
		if (toggle) toggle.setAttribute('aria-expanded', 'false');
	}
	function initShell() {
		buildNav();
		const railToggle = $('#rail-toggle');
		try {
			if (localStorage.getItem('demo.rail') === 'collapsed') document.documentElement.classList.add('rail-collapsed');
		} catch (e) { /* private mode */ }
		railToggle.addEventListener('click', () => {
			const collapsed = document.documentElement.classList.toggle('rail-collapsed');
			try { localStorage.setItem('demo.rail', collapsed ? 'collapsed' : 'open'); } catch (e) {}
			railToggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
			railToggle.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
		});
		$('#nav-toggle').addEventListener('click', () => {
			const app = $('#app');
			const open = !app.classList.contains('nav-open');
			app.classList.toggle('nav-open', open);
			$('#scrim').hidden = !open;
			document.body.classList.toggle('nav-locked', open);
			$('#nav-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
			if (open) {
				const first = $('.nav-head', $('#topmenu'));
				if (first) first.focus();
			}
		});
		$('#scrim').addEventListener('click', closeMobileNav);
		$('#logout-btn').addEventListener('click', () => toast('This is a static demo — there is no session to end.'));
		const note = $('#demo-note');
		try {
			if (sessionStorage.getItem('demo.note') === 'closed') note.hidden = true;
		} catch (e) {}
		$('#demo-note-close').addEventListener('click', () => {
			note.hidden = true;
			try { sessionStorage.setItem('demo.note', 'closed'); } catch (e) {}
		});
	}
	function toast(message, tone = '') {
		const root = $('#toast-root');
		const el = document.createElement('div');
		el.className = 'demo-toast' + (tone ? ' ' + tone : '');
		el.textContent = message;
		root.appendChild(el);
		setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(4px)'; }, 2600);
		setTimeout(() => el.remove(), 2900);
	}
	function closeModal() {
		$('#modal-root').innerHTML = '';
		document.body.classList.remove('nav-locked');
	}
	function openModal(title, body, extraActions = {}, extraForms = {}, opts = {}) {
		Object.assign(actions, { __close: closeModal }, extraActions);
		Object.assign(forms, extraForms);
		$('#modal-root').innerHTML = `<div class="demo-modal-backdrop" data-action="__close"></div>
			<div class="demo-modal${opts.wide ? ' is-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
				<div class="demo-modal-head"><h3>${esc(title)}</h3><button type="button" class="demo-modal-close" data-action="__close" aria-label="Close">×</button></div>
				<div class="demo-modal-body">${body}</div>
			</div>`;
		document.body.classList.add('nav-locked');
		const first = $('#modal-root input, #modal-root select, #modal-root textarea, #modal-root button');
		if (first) first.focus();
	}
	function copyText(text, message = 'Copied to clipboard') {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(() => toast(message)).catch(() => toast('Copy failed — select the text manually.', 'warn'));
		} else {
			toast('Copy is not available in this browser.', 'warn');
		}
	}
	function downloadText(name, text, type = 'text/plain') {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([text], { type }));
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
	function rerender() {
		closeModal();
		render();
	}
	function resetDemo() {
		const fresh = JSON.parse(JSON.stringify(DATA));
		Object.keys(state).forEach(k => { delete state[k]; });
		Object.assign(state, fresh, { openPorts: {}, dnsFilter: '' });
		state.fileshares.browse = null;
		toast('Demo data reset.');
		rerender();
	}

	/* ------------------------------------------------------------ overview */
	const views = {};
	views.overview = {
		title: 'Overview',
		render() {
			const w = state.wan;
			const wifi = state.wifi[0];
			const ports = state.ports;
			return `${pageHead('Overview', 'Live uplink, clients and system health. Every value below is fictional.')}
			<div class="demo-dash">
				<section class="hero" data-state="up">
					<div class="hero-main">
						<div class="hero-top">
							<span class="hero-eyebrow"><span class="dot"></span>Internet · ISP<span class="hero-proto">Wired · DHCP</span></span>
							<span class="hero-live"><span class="pulse"></span>Live</span>
						</div>
						<div class="hero-ip">${w.ip}</div>
						<div class="hero-meta"><span>Gateway ${w.gateway}</span><span>DNS ${w.dns.join(' · ')}</span><span>Up ${w.uptime}</span></div>
						<div class="hero-chart">
							<div class="chart-head"><span>WAN throughput</span><span>Last 3 min</span></div>
							<div class="chart-plot"><svg viewBox="0 0 600 74" preserveAspectRatio="none" aria-hidden="true">
								<g class="chart-grid"><path d="M0 18H600M0 36H600M0 54H600"/></g>
								<path class="chart-area chart-area-rx" d="M0 55 C30 52 45 48 75 49 S120 44 150 46 S210 38 240 40 S300 45 330 42 S390 30 420 33 S480 28 510 31 S570 20 600 22 L600 74 L0 74 Z"/>
								<path class="chart-line chart-line-rx" d="M0 55 C30 52 45 48 75 49 S120 44 150 46 S210 38 240 40 S300 45 330 42 S390 30 420 33 S480 28 510 31 S570 20 600 22"/>
								<path class="chart-line chart-line-tx" d="M0 62 C40 60 70 58 100 59 S160 55 190 57 S250 52 280 54 S340 50 370 51 S430 47 460 49 S520 45 550 46 S580 44 600 45"/>
							</svg></div>
							<div class="chart-legend"><span><i></i>RX <b>2.4 Mbit/s</b></span><span class="lg-tx"><i></i>TX <b>480 kbit/s</b></span><span class="chart-total">${w.rx} in · ${w.tx} out</span></div>
						</div>
					</div>
					<div class="hero-side">
						<a class="hstat" href="#/parental"><span class="hstat-label">LAN devices</span><span class="hstat-value mono">${state.clients}</span><span class="hstat-foot">seen on br-lan</span></a>
						<a class="hstat" href="#/wifi"><span class="hstat-label">Wi-Fi</span><span class="hstat-value mono" style="font-size:13px">${wifi.ssid}</span><span class="hstat-foot">5G ${state.wifi[0].channel} · 2.4G ${state.wifi[1].channel}</span></a>
						<a class="hstat" href="#/vpnsplit"><span class="hstat-label">VPN</span><span class="hstat-value mono">1/2</span><span class="hstat-foot">tunnels up</span></a>
						<a class="hstat" href="#/leds"><span class="hstat-label">System</span><span class="hstat-value mono">14%</span><span class="hstat-foot">mem 54% · load 0.68</span></a>
					</div>
				</section>
				<section class="uplinks">
					<div class="uplinks-head"><span class="uplinks-title">WAN interfaces</span><span class="uplinks-note">In use: ISP · stable ${w.uptime}</span></div>
					<div class="uplinks-list">
						<a class="uplink" data-state="active" href="#/interfaces"><span class="uplink-dot"></span><span class="uplink-name">ISP</span><span class="uplink-proto">DHCP</span><span class="uplink-addr">${w.ip}</span><span class="uplink-badge">In use</span></a>
						<a class="uplink" data-state="parked" href="#/interfaces"><span class="uplink-dot"></span><span class="uplink-name">SIM</span><span class="uplink-proto">MIPC</span><span class="uplink-addr">no address</span><span class="uplink-badge">Parked</span></a>
						<a class="uplink" data-state="parked" href="#/interfaces"><span class="uplink-dot"></span><span class="uplink-name">SIM6</span><span class="uplink-proto">DHCPV6</span><span class="uplink-addr">no address</span><span class="uplink-badge">Parked</span></a>
					</div>
				</section>
			</div>
			<div class="demo-grid three">
				${card('System', kv([
					['Hostname', 'AW1000-Ultra'], ['Model', 'AW1000_Ultra'], ['Architecture', 'ARMv8 Processor rev 0 (v8l)'],
					['Local Time', '2026-11-23 08:19:08'], ['Uptime', '3h 12m 00s'], ['Load Average', '0.68, 0.62, 0.58']
				]))}
				${card('Memory', [
					meter('Total Available', '954.89 MB / 1.60 GB (58%)', 58),
					meter('Used', '889.58 MB / 1.60 GB (54%)', 54),
					meter('Buffered', '77.64 MB / 1.60 GB (4%)', 4),
					meter('Cached', '153.36 MB / 1.60 GB (9%)', 9),
					meter('Swap free', '691.00 MB / 691.00 MB (100%)', 100)
				].join(''))}
				${card('Network', `<div class="demo-netup"><div class="demo-netup-title">IPv4 upstream</div>${kv([
					['Protocol', 'DHCP client'], ['Address', `${w.ip}/24`], ['Gateway', w.gateway],
					['DNS 1', w.dns[0]], ['DNS 2', w.dns[1]], ['Connected', '3h 12m 00s']
				])}<div class="demo-mac">${icon('i-network')} Device: Ethernet Adapter: "eth1" · MAC: 02:00:00:00:00:01</div></div>
				<div class="demo-meter-head"><span>Active connections</span><b>601 / 16384</b></div><div class="demo-meter-bar"><i style="width:3.7%"></i></div>`)}
			</div>
			${card('Active DHCP Leases', table([
				th('Hostname'), th('IPv4 address'), th('MAC address'), th('Lease time remaining')
			], [
				td('living-room-tv') + td('192.168.1.21', 'mono') + td('02:00:00:00:00:21', 'mono') + td('11h 42m'),
				td('kids-tablet') + td('192.168.1.22', 'mono') + td('02:00:00:00:00:22', 'mono') + td('9h 18m'),
				td('work-laptop') + td('192.168.1.33', 'mono') + td('02:00:00:00:00:33', 'mono') + td('7h 04m'),
				td('phone') + td('192.168.1.44', 'mono') + td('02:00:00:00:00:44', 'mono') + td('5h 56m')
			]))}`;
		}
	};

	/* ------------------------------------------------------------ interfaces */
	views.interfaces = {
		title: 'Interfaces',
		render(params) {
			const tab = params.get('tab') || 'ifaces';
			const head = pageHead('Interfaces', 'Logical interfaces and the physical ports behind them.', btn('Scan LAN', 'iface-scan'));
			const tabs = tabbar('interfaces', [['ifaces', 'Interfaces'], ['physical', 'Physical Interfaces']], tab);
			if (tab === 'physical') {
				return head + tabs + card('Physical ports', `<div class="demo-port-grid">${state.ports.map(p => {
					const open = !!state.openPorts[p.id];
					return `<div class="demo-port"><div class="demo-port-head"><span class="dot ${p.state === 'up' ? 'dot-ok' : ''}"></span><span class="demo-port-name">${p.name}</span><span class="demo-port-speed">${p.state === 'up' ? p.speed : 'no link'}</span></div><div class="demo-port-meta"><span>RX ${p.rx}</span><span>TX ${p.tx}</span><span>${p.devices.length} device${p.devices.length === 1 ? '' : 's'}</span></div>${p.devices.length ? `<button type="button" class="btn" style="margin-top:9px" data-action="port-toggle" data-port="${p.id}">${open ? 'Hide' : 'Show'} devices</button><ul class="demo-port-devices" ${open ? '' : 'hidden'}>${p.devices.map(d => `<li><span>${d[0]}</span><span class="mono">${d[1]}</span></li>`).join('')}</ul>` : ''}</div>`;
				}).join('')}</div>`, 'Link state and counters are mocked') + card('How this works', '<p class="demo-desc" style="margin:0">The real page reads switch-port MIB counters and the vendor Wi-Fi stack. The demo shows the same layout with fictional devices.</p>');
			}
			const rows = state.interfaces.map(i => [
				td(`<b>${i.label}</b><span class="demo-sub">${i.name}</span>`),
				td(i.proto, 'mono'), td(i.device, 'mono'), td(i.uptime, 'mono'), td(i.ipv4, 'mono'), td(i.mac, 'mono'),
				td(badge(i.state, i.tone)),
				td(`<div class="demo-table-actions">${btn('Restart', 'iface-restart', { data: { iface: i.label } })}${btn('Stop', 'iface-stop', { data: { iface: i.label } })}</div>`)
			]);
			return head + tabs + card('Interfaces', table([
				th('Interface'), th('Protocol'), th('Device'), th('Uptime'), th('IPv4'), th('MAC'), th('State'), th('', 'right')
			], rows), 'ISP is preferred; the SIM is parked while the ISP answers') +
				card('Uplink policy', kv([['Primary', 'ISP · eth1 · metric 10'], ['Standby', 'SIM · ccmni3 · metric 50'], ['Failover', '3 s probes · 2 failures / 2 successes'], ['Last switch', '3h 12m ago']]));
		},
		init() {
			actions['iface-scan'] = () => toast('LAN scan complete — 6 mock devices found.');
			actions['iface-restart'] = el => toast(`Restart requested for ${el.dataset.iface} (mock).`);
			actions['iface-stop'] = el => toast(`${el.dataset.iface} would be stopped — demo only.`, 'warn');
			actions['port-toggle'] = el => { state.openPorts[el.dataset.port] = !state.openPorts[el.dataset.port]; rerender(); };
		}
	};

	/* ------------------------------------------------------------ parental */
	views.parental = {
		title: 'Parental Control',
		render(params) {
			const tab = params.get('tab') || 'rules';
			const devScope = ['all', 'lan', 'guest'].includes(params.get('scope')) ? params.get('scope') : 'all';
			const isGuest = ip => String(ip || '').startsWith('192.168.5.');
			const blocked = state.devices.filter(d => d.blocked).length;
			const stats = `<div class="demo-stats"><div class="demo-stat"><b>${state.devices.length}</b><span>Devices seen</span></div><div class="demo-stat"><b>${state.rules.length}</b><span>Rules configured</span></div><div class="demo-stat ${blocked ? 'is-danger' : ''}"><b>${blocked}</b><span>Blocked right now</span></div></div>`;
			const tabs = tabbar('parental', [['rules', 'Blocking Rules'], ['domains', 'Domain Blocks'], ['devices', 'Devices & Activity']], tab);
			let body = '';
			if (tab === 'rules') {
				body = card('Blocking rules', table([
					th('Device'), th('MAC address'), th('Mode'), th('Window'), th('State'), th('', 'right')
				], state.rules.map((r, i) => [
					td(`<b>${esc(r.name)}</b>`), td(esc(r.mac), 'mono'), td(esc(r.mode)), td(`${esc(r.window)}<span class="demo-sub">${esc(r.days)}</span>`),
					td(badge(r.state, r.state === 'blocked' ? 'danger' : 'ok')),
					td(`<div class="demo-table-actions">${btn('Remove', 'rule-remove', { data: { index: i } })}</div>`)
				])), 'Rules are checked every minute');
			} else if (tab === 'domains') {
				body = card('Domain blocks', table([
					th('Domain'), th('Applies to'), th('Window'), th('State'), th('', 'right')
				], state.domains.map((d, i) => [
					td(`<b>${esc(d.domain)}</b>`), td(d.target === 'all' ? 'All devices' : esc(d.target), d.target === 'all' ? '' : 'mono'),
					td(esc(d.window)), td(badge(d.enabled ? 'enabled' : 'disabled', d.enabled ? 'ok' : 'plain')),
					td(`<div class="demo-table-actions">${btn(d.enabled ? 'Disable' : 'Enable', 'domain-toggle', { data: { index: i } })}${btn('Remove', 'domain-remove', { data: { index: i } })}</div>`)
				])), 'Resolved IPs are dropped in the PARENTAL chain');
			} else {
				const scoped = state.devices.map((d, i) => ({ d, i })).filter(({ d }) => devScope === 'all' || (devScope === 'guest' ? isGuest(d.ip) : !isGuest(d.ip)));
				const scopeTabs = `<div class="demo-actions" style="margin:-8px 0 16px">${[['all', 'All'], ['lan', 'LAN'], ['guest', 'Guest Wi-Fi']].map(([id, label]) => `<a class="btn ${devScope === id ? 'btn-primary' : ''}" href="${href('parental', { tab: 'devices', scope: id })}">${label}</a>`).join(' ')}<span class="demo-hint">Guest Wi-Fi is 192.168.5.0/24; LAN is the main 192.168.1.0/24.</span></div>`;
				const devRows = scoped.map(({ d, i }) => ({
					attrs: ` data-search="${esc((d.ip + ' ' + d.mac + ' ' + d.host + ' ' + d.vendor).toLowerCase())}"`,
					cells: [td(d.ip, 'mono'), td(d.mac, 'mono'), td(`<b>${esc(d.host)}</b>`), td(esc(d.vendor)), td(d.via), td(badge(d.blocked ? 'blocked' : d.scheduled ? 'scheduled' : 'allowed', d.blocked ? 'danger' : d.scheduled ? 'warn' : 'ok')), td(d.ports, 'mono'), td(`<div class="demo-table-actions">${btn('Ports', 'dev-ports', { data: { index: i } })}${btn(d.blocked ? 'Unblock' : 'Block', 'dev-toggle', { data: { index: i } })}</div>`)]
				}));
				const devTable = scoped.length ? table([
					th('IP address'), th('MAC address'), th('Hostname'), th('Manufacturer'), th('Seen via'), th('Control'), th('Open ports'), th('', 'right')
				], devRows) : empty(devScope === 'guest' ? 'No guest devices' : 'No devices in this view', devScope === 'guest' ? 'No guest devices are connected right now.' : 'No devices match this scope.', 'i-devices');
				body = scopeTabs +
					`<div class="demo-toolbar"><div class="demo-search"><input id="dev-filter" type="search" placeholder="Filter IP, MAC or hostname" aria-label="Filter devices"></div><div class="demo-toolbar-spacer"></div>${btn('Scan LAN', 'dev-scan')}</div>` +
					card('Connected devices', devTable, `${scoped.length} shown`);
			}
			return pageHead('Parental Control', 'Per-device schedules, domain blocks and live device activity.', btn(tab === 'domains' ? 'Add domain' : 'Add device', tab === 'domains' ? 'domain-add' : 'rule-add', { primary: true })) + stats + tabs + body;
		},
		init() {
			actions['rule-add'] = () => openModal('Add a blocking rule', `<form data-form="rule-form" class="demo-form-grid">
				${field('Device name', '<input class="cbi-input-text" name="name" placeholder="Kids tablet" required>')}
				${field('MAC address', '<input class="cbi-input-text mono" name="mac" placeholder="02:00:00:00:00:AA" required>')}
				${field('Mode', '<select class="cbi-input-select" name="mode"><option value="schedule">Schedule</option><option value="ban">Block permanently</option></select>')}
				${field('Window', '<input class="cbi-input-text mono" name="window" value="08:00-20:00">')}
				<div class="cbi-value full"><label class="cbi-value-title">Days</label><div class="cbi-value-field"><div>${checkbox('days_mon', 'Mon', true)}${checkbox('days_tue', 'Tue', true)}${checkbox('days_wed', 'Wed', true)}${checkbox('days_thu', 'Thu', true)}${checkbox('days_fri', 'Fri', true)}${checkbox('days_sat', 'Sat', false)}${checkbox('days_sun', 'Sun', false)}</div></div></div>
				${modalActions('Cancel', 'Add rule')}
			</form>`, {}, {
				'rule-form': (data) => {
					state.rules.push({ name: data.name, mac: data.mac, mode: data.mode === 'ban' ? 'ban' : 'scheduled', window: data.window || '—', days: 'Every day', state: data.mode === 'ban' ? 'blocked' : 'allowed' });
					closeModal(); toast(`Rule added for ${data.name}.`); render();
				}
			});
			actions['rule-remove'] = el => { state.rules.splice(Number(el.dataset.index), 1); toast('Rule removed.'); render(); };
			actions['domain-add'] = () => openModal('Add a domain block', `<form data-form="domain-form" class="demo-form-grid">
				${field('Domain', '<input class="cbi-input-text mono" name="domain" placeholder="video.example" required>')}
				${field('Applies to', '<select class="cbi-input-select" name="target"><option value="all">All devices</option><option value="02:00:00:00:00:AA">Kids tablet (02:00:00:00:00:AA)</option></select>')}
				${field('Window', '<input class="cbi-input-text mono" name="window" value="always">')}
				<div class="cbi-value full"><label class="cbi-value-title">State</label><div class="cbi-value-field">${checkbox('enabled', 'Enabled immediately', true)}</div></div>
				${modalActions('Cancel', 'Add domain')}
			</form>`, {}, {
				'domain-form': (data) => {
					state.domains.push({ domain: data.domain, target: data.target, window: data.window || 'always', enabled: !!data.enabled });
					closeModal(); toast(`Domain ${data.domain} added.`); render();
				}
			});
			actions['domain-toggle'] = el => { const d = state.domains[Number(el.dataset.index)]; d.enabled = !d.enabled; toast(`${d.domain} ${d.enabled ? 'enabled' : 'disabled'}.`); render(); };
			actions['domain-remove'] = el => { state.domains.splice(Number(el.dataset.index), 1); toast('Domain rule removed.'); render(); };
			actions['dev-scan'] = () => toast('Scan complete — 6 mock devices found.');
			actions['dev-toggle'] = el => { const d = state.devices[Number(el.dataset.index)]; d.blocked = !d.blocked; toast(`${d.host} is now ${d.blocked ? 'blocked' : 'allowed'}.`); render(); };
			actions['dev-ports'] = el => { const d = state.devices[Number(el.dataset.index)]; openModal(`${d.host} — open ports`, `<p class="demo-desc">TCP connect scan of the common ports. Values are mock data.</p><div class="demo-kv"><div><span>Address</span><b class="mono">${d.ip}</b></div><div><span>Ports</span><b class="mono">${d.ports}</b></div><div><span>Last scan</span><b>2 minutes ago</b></div></div>`); };
			const filter = $('#dev-filter');
			if (filter) {
				filter.addEventListener('input', () => {
					const q = filter.value.trim().toLowerCase();
					$$('#maincontent tbody tr[data-search]').forEach(row => { row.hidden = q && !row.dataset.search.includes(q); });
				});
			}
		}
	};

	/* Status → Devices & Activity is an alias of the parental device view. */
	views['parental-activity'] = {
		title: 'Devices & Activity',
		render() { return views.parental.render(new URLSearchParams('tab=devices')); },
		init() { views.parental.init(new URLSearchParams('tab=devices')); }
	};

	/* ------------------------------------------------------------ captive */
	const CP_IFACES = [
		['br-lan', 'LAN (br-lan) · eth0, ra0, rai0, rndis0'],
		['br-guest', 'Guest Wi-Fi (br-guest) · ra1, rai1'],
		['eth1', 'ISP (eth1)'],
		['wgvpn', 'VPN split tunnel (wgvpn)'],
		['wghome', 'Home WireGuard (wghome)']
	];
	views.captive = {
		title: 'Captive Portal',
		render() {
			const c = state.captive;
			const requests = c.requests.length ? table([
				th('Time'), th('Client'), th('MAC'), th('Country'), th('Browser')
			], c.requests.map(r => [td(r[0], 'mono'), td(r[1], 'mono'), td(r[2], 'mono'), td(r[3]), td(esc(r[5]))])) : empty('No splash requests', 'Nobody has opened the splash page yet.', 'i-wifi');
			const acceptances = c.acceptances.length ? table([
				th('Time'), th('IP address'), th('MAC address'), th('Vendor'), th('Country'), th('Requested page')
			], c.acceptances.map(r => [td(r[0], 'mono'), td(r[1], 'mono'), td(r[2], 'mono'), td(esc(r[5] || '—')), td(r[3]), td(esc(r[4]))])) : empty('No acceptances yet', 'Guests who accept the terms will appear here.', 'i-devices');
			const iface = CP_IFACES.find(x => x[0] === c.gateIface) || [c.gateIface, c.gateIface];
			const status = card('Status', `<div class="demo-kv">
				<div><span>Splash server</span><b><span class="dot ${c.enabled ? 'dot-ok' : 'dot-warn'}"></span> ${c.enabled ? 'running' : 'disabled'}</b></div>
				<div><span>Portal URL</span><b class="mono">http://192.168.1.1:${c.port}/</b></div>
				<div><span>Gated interface</span><b>${esc(iface[1])}</b></div>
				<div><span>Sessions</span><b>${c.active} active · ${c.acceptedToday} accepted today</b></div>
			</div><div class="demo-form-actions">${btn('Preview splash page', 'cp-preview')}</div>`);
			const settings = `<form data-form="cp-save" class="demo-form-grid">
				<div class="cbi-value full"><label class="cbi-value-title">Portal enabled</label><div class="cbi-value-field">${checkbox('enabled', 'Start the splash server and apply the firewall rules', c.enabled)}</div></div>
				${field('Network interface', `<select class="cbi-input-select" name="gate_iface">${CP_IFACES.map(([dev, label]) => `<option value="${dev}"${dev === c.gateIface ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`, 'Only traffic entering the router on this interface is gated. A bridge is one interface; its ports and radios are listed there.', 'full')}
				<div class="demo-adv full">
					<details>
						<summary>Advanced settings</summary>
						<div class="demo-adv-body">
							${field('Heading', `<input class="cbi-input-text" name="title" value="${esc(c.title)}">`, '', 'full')}
							${field('Subheading', `<input class="cbi-input-text" name="subtitle" value="${esc(c.subtitle)}">`, '', 'full')}
							${field('Intro line', `<input class="cbi-input-text" name="intro" value="${esc(c.intro)}">`, '', 'full')}
							${field('Listen port', `<input class="cbi-input-text mono" name="port" value="${c.port}">`, 'Default 8088. Port 80 belongs to LuCI.')}
							${field('Session length (minutes)', `<input class="cbi-input-text mono" name="session" value="${c.session}">`, 'Shown on the page; also the whitelist timeout.')}
							${field('Exempt devices', `<input class="cbi-input-text mono" name="exempt" value="${esc(c.exempt)}">`, 'MACs that never see the portal, on any gated interface.', 'full')}
							<div class="cbi-value full"><label class="cbi-value-title">Terms of use</label><div class="cbi-value-field"><textarea class="cbi-input-text" name="terms" rows="8" style="width:100%;max-width:100%">${esc(c.terms)}</textarea><div class="cbi-value-description">Plain text, one paragraph per line. Stored on the router, not in this demo.</div></div></div>
						</div>
					</details>
				</div>
				<div class="demo-form-actions full"><button type="submit" class="btn btn-primary">Save &amp; restart</button></div>
			</form>`;
			const activity = `<details class="demo-activity">
				<summary>Recent activity <span class="demo-card-note">${c.acceptances.length} accepted, ${c.requests.length} splash requests</span></summary>
				<div class="demo-activity-body">
					${card('Recent acceptances', acceptances, 'full log')}
					${card('Recent splash requests', requests)}
				</div>
			</details>`;
			return pageHead('Captive Portal', 'A terms page for guests. Traffic entering the router on the selected network interface is redirected to it and blocked until the visitor accepts.') +
				status +
				card('Settings', settings) +
				activity;
		},
		init() {
			actions['cp-preview'] = () => {
				const c = state.captive;
				const mins = Number(c.session) || 240;
				const sessionLabel = mins % 60 === 0
					? `${mins / 60} hour${mins === 60 ? '' : 's'}`
					: `${Math.floor(mins / 60)} h ${mins % 60} min`;
				const preview = `<div class="demo-portal">
					<aside class="demo-portal-brand">
						<span class="demo-portal-mark">${icon('i-wifi')}</span>
						<p class="demo-portal-eyebrow">Guest Wi-Fi</p>
						<h3>Welcome to <span>${esc(c.title)}</span></h3>
						<p class="demo-portal-sub">${esc(c.subtitle)}</p>
						<p class="demo-portal-intro">${esc(c.intro)}</p>
						<ul class="demo-portal-chips"><li>Isolated network</li><li>Up to ${esc(sessionLabel)}</li><li>Terms required</li></ul>
					</aside>
					<section class="demo-portal-body">
						<h4>Terms of use</h4>
						<p class="demo-hint">Please review and accept to continue.</p>
						<div class="demo-portal-terms">${esc(c.terms)}</div>
						<button type="button" class="btn btn-primary demo-portal-accept" id="demo-accept" data-action="splash-accept">Accept &amp; continue</button>
						<p class="demo-portal-fine">By tapping <b>Accept &amp; continue</b> you agree to the terms of use. Your session lasts up to <b>${esc(sessionLabel)}</b>.</p>
						<p class="demo-portal-privacy"><b>Privacy:</b> we record your device address and the time you accept these terms.</p>
					</section>
				</div>`;
				openModal('Splash preview', preview, {
					'splash-accept': () => {
						c.acceptedToday += 1;
						c.active += 1;
						c.acceptances.unshift(['2026-11-23 08:21:00', '192.168.5.42', '02:00:00:00:00:99', 'GB', 'http://example.com/', 'Example Phone']);
						closeModal(); toast('Terms accepted — mock session opened.'); render();
					}
				}, {}, { wide: true });
			};
			forms['cp-save'] = data => {
				state.captive.enabled = !!data.enabled;
				if (data.gate_iface) state.captive.gateIface = data.gate_iface;
				state.captive.title = data.title || state.captive.title;
				state.captive.subtitle = data.subtitle || state.captive.subtitle;
				state.captive.intro = data.intro || state.captive.intro;
				state.captive.session = data.session || state.captive.session;
				state.captive.port = Number(data.port) || state.captive.port;
				state.captive.terms = data.terms || state.captive.terms;
				if (data.exempt !== undefined) state.captive.exempt = data.exempt;
				toast('Captive portal settings saved (mock).');
				render();
			};
		}
	};

	/* ------------------------------------------------------------ web viewer */
	views.webview = {
		title: 'Web Viewer',
		render(params) {
			const tab = params.get('tab') || 'viewer';
			const w = state.webview;
			const tabs = tabbar('webview', [['viewer', 'Viewer'], ['status', 'Status'], ['settings', 'Settings']], tab);
			if (tab === 'status') {
				return pageHead('Web Viewer', 'A link-rewriting gateway: the router fetches pages and serves them back through its own address.') + tabs +
					card('Egress', `<div class="demo-status-strip"><span class="dot ${w.vpn ? 'dot-ok' : 'dot-warn'}"></span><b>${w.vpn ? 'NordVPN (wgvpn) · up · handshake ' + w.handshake : 'WAN · VPN unavailable, failing open'}</b><span>${w.failOpen ? 'fail-open enabled' : 'fail-closed'}</span></div>
					${kv([['Socket mark', w.mark], ['Policy rule', 'fwmark ' + w.mark + ' lookup 101'], ['Table 101', w.vpn ? 'default dev wgvpn' : 'withdrawn (falls through to WAN)'], ['Viewer service', 'running on :' + w.port]])}
					<div class="demo-form-actions">${btn(w.vpn ? 'Disable VPN egress' : 'Enable VPN egress', 'webview-toggle-vpn')}</div>`) +
					card('How it works', '<p class="demo-desc" style="margin:0">Viewer requests are marked per socket. A policy rule sends them to a dedicated table only while the WireGuard handshake is fresh; when the tunnel is down the table is withdrawn and traffic falls through to the WAN.</p>');
			}
			if (tab === 'settings') {
				return pageHead('Web Viewer', 'Viewer listener and egress settings.') + tabs +
					card('Settings', `<form data-form="webview-save" class="demo-form-grid">
						${field('Listen port', `<input class="cbi-input-text mono" name="port" value="${w.port}">`)}
						${field('Bind address', `<input class="cbi-input-text mono" name="bind" value="${esc(w.bind)}">`, 'Every router address; the WAN zone still drops the port.')}
						${field('Socket mark', `<input class="cbi-input-text mono" name="mark" value="${esc(w.mark)}">`)}
						<div class="cbi-value"><label class="cbi-value-title">Fail open</label><div class="cbi-value-field">${checkbox('failOpen', 'When the VPN is down, send viewer traffic to the WAN', w.failOpen)}</div></div>
						<div class="demo-form-actions full"><button type="submit" class="btn btn-primary">Save settings</button></div>
					</form>`);
			}
			const frame = w.current
				? `<div class="demo-mockpage"><div class="demo-mockpage-url">${esc(w.current)}</div>${mockViewerPage(w.current)}</div>`
				: `<div class="demo-empty">${icon('i-tools')}<b>Type a URL to start browsing</b><span>The router fetches the page and rewrites its links, forms, stylesheets and images to stay inside the viewer.</span><button type="button" class="btn btn-primary" data-action="viewer-demo">Try example.com</button></div>`;
			return pageHead('Web Viewer', 'Type a URL and the router fetches the page for you. This demo uses a static mock page — no network request is made.') + tabs +
				card('Viewer', `<form class="demo-viewer-bar" data-form="viewer-go">
					${btn('Home', 'viewer-home')}
					<input name="url" value="${esc(w.current)}" placeholder="example.com or https://example.com" aria-label="URL to open">
					<button type="submit" class="btn btn-primary">Go</button>
				</form><div class="demo-viewer-frame">${frame}</div>`, 'links and forms are rewritten in the real gateway');
		},
		init() {
			forms['viewer-go'] = data => {
				let url = String(data.url || '').trim();
				if (!url) { toast('Enter a URL first.', 'warn'); return; }
				if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
				state.webview.current = url;
				render();
			};
			actions['viewer-home'] = () => { state.webview.current = ''; render(); };
			actions['viewer-demo'] = () => { state.webview.current = 'https://example.com/'; render(); };
			actions['viewer-follow'] = el => { state.webview.current = el.dataset.url; render(); };
			actions['webview-toggle-vpn'] = () => { state.webview.vpn = !state.webview.vpn; toast(`VPN egress ${state.webview.vpn ? 'enabled' : 'disabled'} (mock).`); render(); };
			forms['webview-save'] = data => {
				state.webview.port = data.port || state.webview.port;
				state.webview.bind = data.bind || state.webview.bind;
				state.webview.mark = data.mark || state.webview.mark;
				state.webview.failOpen = !!data.failOpen;
				toast('Web Viewer settings saved (mock).'); render();
			};
		}
	};
	function mockViewerPage(url) {
		const links = `<div class="demo-mocklinks"><button type="button" class="btn" data-action="viewer-follow" data-url="https://example.com/">example.com</button><button type="button" class="btn" data-action="viewer-follow" data-url="https://example.org/">example.org</button><button type="button" class="btn" data-action="viewer-follow" data-url="https://example.net/">example.net</button></div>`;
		if (/example\.com/i.test(url)) {
			return `<h3>Example Domain</h3><p>This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.</p><p>This mock page is rendered locally by the demo. In the real gateway the router makes the request and rewrites every link back through the viewer.</p>${links}`;
		}
		return `<h3>Fetched page</h3><p>The router fetched <b>${esc(url)}</b> and served it back through the viewer. Links, forms, styles and images would be rewritten to stay on the router's address.</p><p>The demo does not make network requests; this is a static stand-in for the rewritten page.</p>${links}`;
	}

	/* ------------------------------------------------------------ file shares */
	views.fileshares = {
		title: 'File Shares',
		render() {
			const fs = state.fileshares;
			const shares = table([
				th('Name'), th('Server / share'), th('User'), th('', 'right')
			], fs.shares.map(s => [
				td(`<b>${esc(s.label)}</b>`), td(`${esc(s.host)}:${s.port} / ${esc(s.share)}`, 'mono'), td(s.guest ? 'guest' : esc(s.user), 'mono'),
				td(`<div class="demo-table-actions">${btn('Browse', 'fs-browse', { data: { id: s.id } })}${btn('Test', 'fs-test', { data: { id: s.id } })}${btn('Edit', 'fs-edit', { data: { id: s.id } })}</div>`)
			]));
			const used = fs.files.reduce((n, f) => n + (parseFloat(f.size) || 0) * (f.size.includes('GB') ? 1024 : 1), 0);
			const local = table([
				th('Name'), th('Size', 'right'), th('Modified'), th('', 'right')
			], fs.files.length ? fs.files.map((f, i) => [
				td(esc(f.name)), td(f.size, 'right mono'), td(f.modified, 'mono'),
				td(`<div class="demo-table-actions">${btn('Download', 'fs-local-download', { data: { index: i } })}${btn('Delete', 'fs-local-delete', { data: { index: i } })}</div>`)
			]) : [td(empty('No files on the router yet', 'Use Upload to add a mock file.', 'i-log'))]);
			let browse = '';
			if (fs.browse) {
				const b = fs.browse;
				const share = fs.shares.find(s => s.id === b.id);
				const tree = fs.tree[b.id] || {};
				const entries = tree[b.path] || [];
				const parts = b.path ? b.path.split('/') : [];
				const crumbs = [`<button type="button" class="btn" data-action="fs-path" data-path="">/</button>`].concat(parts.map((p, i) => `<button type="button" class="btn" data-action="fs-path" data-path="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`)).join(' <span class="demo-hint" style="display:inline">/</span> ');
				browse = card(`Browse: ${esc(share ? share.label : b.id)}`, `<div class="demo-toolbar">${crumbs}<div class="demo-toolbar-spacer"></div>${btn('Upload demo file', 'fs-upload')}${btn('Close', 'fs-close')}</div>` + table([
					th('Name'), th('Size', 'right'), th('', 'right')
				], entries.length ? entries.map((e, i) => [
					td(e.dir ? `<button type="button" class="demo-link" data-action="fs-folder" data-name="${esc(e.name)}">${icon('i-arrow', 'icon')} ${esc(e.name)}/</button>` : esc(e.name)),
					td(e.dir ? '—' : (e.size || '—'), 'right mono'),
					td(e.dir ? '' : `<div class="demo-table-actions">${btn('Download', 'fs-download', { data: { name: e.name } })}${btn('Delete', 'fs-tree-delete', { data: { index: i } })}</div>`)
				]) : [td(empty('This folder is empty', 'Upload a demo file or go back.', 'i-log'))]), 'mock SMB tree');
			}
			return pageHead('File Shares', 'Browse SMB/CIFS shares without mounting them, and keep a small drop box on the router.', btn('Add share', 'fs-add', { primary: true })) +
				card('Shares', shares, 'smbclient available') + browse +
				card('Router storage', `<div class="demo-toolbar"><span class="demo-hint">${used.toFixed(1)} MB of 1 GB used</span><div class="demo-toolbar-spacer"></div>${btn('Upload to router', 'fs-local-upload')}</div>${local}`, '100 MB per file') +
				card('Add a share', `<form data-form="fs-add" class="demo-form-grid">
					${field('Name', '<input class="cbi-input-text" name="label" placeholder="Media">')}
					${field('Host', '<input class="cbi-input-text mono" name="host" placeholder="192.168.1.20">')}
					${field('Share', '<input class="cbi-input-text mono" name="share" placeholder="media">')}
					${field('User', '<input class="cbi-input-text" name="user" placeholder="guest">')}
					<div class="demo-form-actions full"><button type="submit" class="btn btn-primary">Add share</button></div>
				</form>`);
		},
		init() {
			actions['fs-browse'] = el => { state.fileshares.browse = { id: el.dataset.id, path: '' }; render(); };
			actions['fs-test'] = () => toast('SMB connection OK (mock).');
			actions['fs-edit'] = el => {
				const s = state.fileshares.shares.find(x => x.id === el.dataset.id);
				if (!s) return;
				openModal(`Edit ${s.label}`, `<form data-form="fs-save" class="demo-form-grid">
					<input type="hidden" name="id" value="${esc(s.id)}">
					${field('Name', `<input class="cbi-input-text" name="label" value="${esc(s.label)}">`)}
					${field('Host', `<input class="cbi-input-text mono" name="host" value="${esc(s.host)}">`)}
					${field('Share', `<input class="cbi-input-text mono" name="share" value="${esc(s.share)}">`)}
					${field('User', `<input class="cbi-input-text" name="user" value="${esc(s.user)}">`)}
					${modalActions('Cancel', 'Save')}
				</form>`, {}, {
					'fs-save': data => {
						const target = state.fileshares.shares.find(x => x.id === data.id);
						if (target) { target.label = data.label; target.host = data.host; target.share = data.share; target.user = data.user; }
						closeModal(); toast('Share updated (mock).'); render();
					}
				});
			};
			actions['fs-add'] = () => openModal('Add a share', `<form data-form="fs-new" class="demo-form-grid">
				${field('Name', '<input class="cbi-input-text" name="label" placeholder="Media">')}
				${field('Host', '<input class="cbi-input-text mono" name="host" placeholder="192.168.1.20">')}
				${field('Share', '<input class="cbi-input-text mono" name="share" placeholder="media">')}
				${field('User', '<input class="cbi-input-text" name="user" placeholder="guest">')}
				${modalActions('Cancel', 'Add share')}
			</form>`, {}, {
				'fs-new': data => {
					if (!data.label || !data.host) { toast('Name and host are required.', 'warn'); return; }
					state.fileshares.shares.push({ id: 'share-' + Date.now(), label: data.label, host: data.host, share: data.share || 'share', port: 445, user: data.user || 'guest', guest: true });
					closeModal(); toast(`Share ${data.label} added (mock).`); render();
				}
			});
			actions['fs-path'] = el => { state.fileshares.browse.path = el.dataset.path; render(); };
			actions['fs-folder'] = el => { const b = state.fileshares.browse; b.path = b.path ? b.path + '/' + el.dataset.name : el.dataset.name; render(); };
			actions['fs-close'] = () => { state.fileshares.browse = null; render(); };
			actions['fs-upload'] = () => {
				const b = state.fileshares.browse; const tree = state.fileshares.tree[b.id] || (state.fileshares.tree[b.id] = {});
				(tree[b.path] || (tree[b.path] = [])).push({ name: 'demo-file-' + (tree[b.path].length + 1) + '.txt', dir: false, size: '2 KB' });
				toast('Demo file uploaded.'); render();
			};
			actions['fs-download'] = el => toast(`Downloading ${el.dataset.name} (mock).`);
			actions['fs-tree-delete'] = el => { const b = state.fileshares.browse; const tree = state.fileshares.tree[b.id] || {}; (tree[b.path] || []).splice(Number(el.dataset.index), 1); toast('File removed.'); render(); };
			actions['fs-local-upload'] = () => {
				state.fileshares.files.push({ name: 'demo-upload-' + (state.fileshares.files.length + 1) + '.bin', size: '12.4 MB', modified: '2026-11-23 08:20' });
				toast('Mock file uploaded to the router.'); render();
			};
			actions['fs-local-download'] = el => toast(`Downloading ${state.fileshares.files[Number(el.dataset.index)].name} (mock).`);
			actions['fs-local-delete'] = el => { state.fileshares.files.splice(Number(el.dataset.index), 1); toast('File deleted.'); render(); };
		}
	};

	/* ------------------------------------------------------------ opencode */
	views.opencode = {
		title: 'OpenCode',
		render(params) {
			const tab = params.get('tab') || 'session';
			const oc = state.opencode;
			const tabs = tabbar('opencode', [['session', 'Session'], ['status', 'Status'], ['connection', 'Connection']], tab);
			if (tab === 'status') {
				return pageHead('OpenCode', 'Pair with an existing OpenCode server and use its web UI from this page.') + tabs +
					card('Status', `${kv([['Pairing', `<span class="dot dot-ok"></span> paired`], ['Server', `<span class="mono">${esc(oc.server)}</span>`], ['Session age', `${esc(oc.age)} <span class="demo-hint" style="display:inline">sessions last 30 days</span>`], ['Local URL', `<span class="mono">${esc(oc.local)}</span>`], ['Last error', '—']])}<div class="demo-form-actions">${btn('Pair now', 'oc-pair')}${btn('Reload', 'oc-reload')}</div>`, 'mock status') +
					card('How it works', '<p class="demo-desc" style="margin:0">The proxy signs in to the server once, keeps the session cookie server-side, and forwards the UI, API and WebSocket on the LAN. A 401 after a server restart triggers one automatic re-pair.</p>');
			}
			if (tab === 'connection') {
				return pageHead('OpenCode', 'Connection settings for the local proxy.') + tabs +
					card('Connection', `<form data-form="oc-save" class="demo-form-grid">
						${field('Server URL', `<input class="cbi-input-text mono" name="server" value="${esc(oc.server)}">`, 'The upstream OpenCode server on the LAN.')}
						${field('Password', '<input class="cbi-input-text" type="password" name="password" value="" placeholder="unchanged" autocomplete="new-password">', 'Stored in /etc/config/opencode (0600) on the router.')}
						${field('Pairing link', '<input class="cbi-input-text mono" name="pair" value="" placeholder="https://…/auth/connect/<code>">', 'One-time, five-minute link from opencode pair.')}
						<div class="demo-form-actions full"><button type="submit" class="btn btn-primary">Save connection</button></div>
					</form>`, 'the demo does not connect') +
					card('Proxy', kv([['Local URL', `<span class="mono">${esc(oc.local)}</span>`], ['Listen address', '0.0.0.0:8091'], ['Session lifetime', '30 days or until the password changes'], ['HTTPS front door', 'ocgate on :443 (optional)']]));
			}
			const active = oc.sessions.find(s => s.id === oc.activeSession) || oc.sessions[0];
			const messages = oc.messages[active.id] || [];
			const sessions = oc.sessions.map(s => `<button type="button" class="demo-oc-item ${s.id === active.id ? 'is-active' : ''}" data-action="oc-select" data-id="${s.id}"><span class="demo-oc-glyph">${esc(s.glyph)}</span><span><b>${esc(s.title)}</b><small>${esc(s.project)}</small></span><time>${esc(s.time)}</time></button>`).join('');
			return pageHead('OpenCode', 'A static mock of the OpenCode client: search sessions, switch chats and send a message. No server is contacted.') + tabs +
				card('Session', `<div class="demo-oc">
					<aside class="demo-oc-side">
						<div class="demo-oc-brand"><span class="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><use href="#i-mark"/></svg></span>OpenCode</div>
						<h4>Projects</h4>
						<div class="demo-oc-project is-active">${icon('i-grid', 'icon')} Demo project</div>
						<div class="demo-oc-project">${icon('i-grid', 'icon')} Router notes</div>
						<h4>Workspace</h4>
						<div class="demo-oc-project">${icon('i-sliders', 'icon')} Settings</div>
						<div class="demo-oc-project">${icon('i-log', 'icon')} Help</div>
					</aside>
					<div class="demo-oc-main">
						<div class="demo-oc-toolbar"><input id="oc-search" type="search" placeholder="Search sessions" aria-label="Search sessions">${btn('New session', 'oc-new', { primary: true })}</div>
						<div class="demo-oc-list">${sessions}</div>
						<div class="demo-oc-chat">
							<div class="demo-oc-chat-head"><b>${esc(active.title)}</b><span class="demo-hint">${esc(active.project)}</span></div>
							${messages.length ? messages.map(m => `<div class="demo-msg ${m.role}">${esc(m.text)}</div>`).join('') : empty('No messages yet', 'Send a message to start the mock conversation.', 'i-log')}
							<form class="demo-oc-compose" data-form="oc-send"><input name="message" placeholder="Message the demo assistant…" aria-label="Message" required><button type="submit" class="btn btn-primary">Send</button></form>
						</div>
					</div>
				</div>`);
		},
		init() {
			const oc = state.opencode;
			const filter = $('#oc-search');
			if (filter) filter.addEventListener('input', () => {
				const q = filter.value.trim().toLowerCase();
				$$('#maincontent .demo-oc-item').forEach(el => { el.hidden = q && !el.textContent.toLowerCase().includes(q); });
			});
			actions['oc-select'] = el => { oc.activeSession = el.dataset.id; render(); };
			actions['oc-new'] = () => openModal('New session', `<form data-form="oc-new" class="demo-form-grid">
				${field('Title', '<input class="cbi-input-text" name="title" placeholder="Untitled session" required>')}
				${field('Project', '<select class="cbi-input-select" name="project"><option>Demo project</option><option>Router notes</option></select>')}
				${modalActions('Cancel', 'Create session')}
			</form>`, {}, {
				'oc-new': data => {
					const id = 's' + Date.now();
					oc.sessions.unshift({ id, title: data.title || 'Untitled session', project: data.project || 'Demo project', time: 'now', glyph: (data.project || 'D').slice(0, 1) });
					oc.messages[id] = [];
					oc.activeSession = id;
					closeModal(); toast('Session created (mock).'); render();
				}
			});
			forms['oc-send'] = data => {
				const id = oc.activeSession;
				const text = String(data.message || '').trim();
				if (!text) return;
				(oc.messages[id] || (oc.messages[id] = [])).push({ role: 'user', text });
				(oc.messages[id]).push({ role: 'assistant', text: 'This is a static demo reply. In the real client this message would be sent to your OpenCode server.' });
				render();
			};
			actions['oc-pair'] = () => toast('Pairing refreshed (mock).');
			actions['oc-reload'] = () => toast('Session reloaded (mock).');
			forms['oc-save'] = () => { toast('Connection settings saved (mock).'); };
		}
	};

	/* ------------------------------------------------------------ siem */
	views.siem = {
		title: 'SIEM Forwarding',
		render() {
			const s = state.siem;
			const status = `<div class="demo-kv">
				<div><span>Service</span><b><span class="dot ${s.enabled ? 'dot-ok' : ''}"></span> ${s.enabled ? 'On — forwarding' : 'Off — forwarder disabled'}</b></div>
				<div><span>Endpoint</span><b class="mono">${esc(s.endpoint)}</b></div>
				<div><span>Sources</span><b class="mono">${s.sources.join(' ')}</b></div>
				<div><span>Queue</span><b class="mono">${esc(s.queue)}</b></div>
				<div><span>Delivered / dropped / errors</span><b class="mono">${s.delivered} / ${s.dropped} / ${s.errors}</b></div>
				<div><span>Last success</span><b class="mono">${esc(s.lastOk)}</b></div>
				<div><span>Last error</span><b>—</b></div>
			</div><div class="demo-form-actions">${btn('Send test event', 'siem-test')}${btn('Clear log', 'siem-clear')}</div>`;
			const log = s.log.length ? `<div class="demo-log">${s.log.map(l => `<span class="demo-log-line">${esc(l)}</span>`).join('')}</div>` : empty('No log entries yet', 'Send a test event to see a mock entry.', 'i-log');
			return pageHead('SIEM Forwarding', 'Ships this router’s logs to an external SIEM or log collector. Events are spooled locally first, so a slow or unreachable collector does not block logging.', btn(s.enabled ? 'Turn forwarder off' : 'Turn forwarder on', 'siem-toggle')) +
				card('Status', status) + card('Recent forwarder log', log) +
				card('Forwarding', `<form data-form="siem-save" class="demo-form-grid">
					<div class="cbi-value full"><label class="cbi-value-title">Forwarding</label><div class="cbi-value-field">${checkbox('enabled', 'Forwarder enabled', s.enabled)}<br>${checkbox('target_enabled', 'Target enabled', s.target)}</div></div>
					<div class="cbi-value full"><label class="cbi-value-title">Sources</label><div class="cbi-value-field">${checkbox('src_syslog', 'System log', s.sources.includes('syslog'))}<br>${checkbox('src_dns', 'DNS queries', s.sources.includes('dns'))}<br>${checkbox('src_portal', 'Captive portal', s.sources.includes('portal'))}</div></div>
					${field('Transport', `<select class="cbi-input-select" name="transport"><option value="syslog" ${s.transport === 'syslog' ? 'selected' : ''}>Syslog (RFC5424 / RFC3164)</option><option value="http" ${s.transport === 'http' ? 'selected' : ''}>HTTPS collector (JSON / Splunk)</option></select>`)}
					${field('Host', `<input class="cbi-input-text mono" name="host" value="${esc(s.host)}">`)}
					${field('Port', `<input class="cbi-input-text mono" name="port" value="${esc(s.port)}">`)}
					${field('TLS verification', `<label class="demo-check"><input type="checkbox" name="tls_verify" checked> Verify the collector certificate</label>`)}
					<div class="demo-form-actions full"><button type="submit" class="btn btn-primary">Save settings</button></div>
				</form>`, 'token values are never shown in this demo');
		},
		init() {
			actions['siem-toggle'] = () => { state.siem.enabled = !state.siem.enabled; toast(`Forwarder ${state.siem.enabled ? 'enabled' : 'disabled'} (mock).`); render(); };
			actions['siem-test'] = () => {
				state.siem.log.unshift('2026-11-23 08:21:07 test event sent target=' + state.siem.endpoint);
				state.siem.lastOk = '2026-11-23 08:21:07';
				state.siem.delivered += 1;
				toast('Test event queued and sent (mock).'); render();
			};
			actions['siem-clear'] = () => { state.siem.log = []; toast('Forwarder log cleared.'); render(); };
			forms['siem-save'] = data => {
				state.siem.enabled = !!data.enabled;
				state.siem.target = !!data.target_enabled;
				state.siem.sources = ['syslog', 'dns', 'portal'].filter(k => data['src_' + k]);
				state.siem.transport = data.transport;
				state.siem.host = data.host;
				state.siem.port = data.port;
				state.siem.endpoint = `${data.host || 'collector.example'}:${data.port || '6514'}${data.transport === 'syslog' ? '/TLS' : ''}`;
				toast('SIEM settings saved (mock).'); render();
			};
		}
	};

	/* ------------------------------------------------------------ leds */
	views.leds = {
		title: 'LED Configuration',
		render() {
			const l = state.leds;
			const offline = l.test === 'offline';
			const on = id => {
				if (!l.enabled) return false;
				if (id === 'internet') return !offline;
				if (id === 'red') return offline;
				if (id === 'signal') return false;
				return true;
			};
			const status = kv([
				['Controller', `<span class="dot ${l.enabled ? 'dot-ok' : ''}"></span> ${l.enabled ? 'running' : 'disabled'}`],
				['Uplink', `<span class="dot ${offline ? 'dot-warn' : 'dot-ok'}"></span> ${offline ? 'offline (test state)' : 'online'}`],
				['Vendor LED daemon', 'parked — this controller owns the LEDs']
			]);
			const leds = l.items.map(item => `<div class="demo-led ${on(item.id) ? 'is-on' : ''}"><div class="demo-led-name">${esc(item.name)}</div><div class="demo-led-state"><span class="demo-led-dot"></span>${on(item.id) ? 'on' : 'off'}</div><p>${esc(item.desc)}</p></div>`).join('');
			return pageHead('LEDs', 'Drives the router LEDs from the real uplink state. The firmware daemon reads the modem, which is wrong while the ISP carries traffic and the SIM is parked.') +
				card('Status', status) + card('Current LEDs', `<div class="demo-led-grid">${leds}</div>`) +
				card('Settings', `<form data-form="leds-save" class="demo-form-grid">
					<div class="cbi-value full"><label class="cbi-value-title">Controller</label><div class="cbi-value-field">${checkbox('enabled', 'Enable the LED controller', l.enabled)}<br>${checkbox('blink', 'Blink the internet LED while offline', l.blink)}</div></div>
					${field('Refresh interval (seconds)', `<input class="cbi-input-text mono" name="interval" value="${l.interval}">`, '2–300 seconds, default 5.')}
					${field('Test state', `<select class="cbi-input-select" name="test"><option value="real" ${l.test === 'real' ? 'selected' : ''}>Use the real uplink state</option><option value="online" ${l.test === 'online' ? 'selected' : ''}>Force online</option><option value="offline" ${l.test === 'offline' ? 'selected' : ''}>Force offline</option></select>`, 'Useful for trying the LED behaviour without touching the uplink.')}
					<div class="demo-form-actions full"><button type="submit" class="btn btn-primary">Save settings</button></div>
				</form>`, 'disabling hands the LEDs back to the vendor daemon');
		},
		init() {
			forms['leds-save'] = data => {
				state.leds.enabled = !!data.enabled;
				state.leds.blink = !!data.blink;
				state.leds.interval = data.interval || state.leds.interval;
				state.leds.test = data.test || 'real';
				toast('LED settings saved (mock).'); render();
			};
		}
	};

	/* ------------------------------------------------------------ dns log */
	function categoryTone(cat) {
		return ({ Streaming: 'accent', Social: 'accent', Software: 'plain', Infrastructure: 'warn', Web: 'plain', Developer: 'accent' })[cat] || 'plain';
	}
	views.dnslog = {
		title: 'DNS Log',
		render(params) {
			const d = state.dns;
			const devMac = params.get('dev');
			const scope = ['all', 'lan', 'guest'].includes(params.get('scope')) ? params.get('scope') : 'all';
			const isGuest = ip => String(ip).startsWith('192.168.5.');
			const inScope = ip => scope === 'all' || (scope === 'guest' ? isGuest(ip) : !isGuest(ip));
			const devices = d.devices.filter(x => inScope(x.ip));
			const queries = d.queries.filter(q => inScope(q.client));
			const scopeTabs = `<div class="demo-actions" style="margin:-8px 0 18px">${[['all', 'All'], ['lan', 'LAN'], ['guest', 'Guest Wireless']].map(([id, label]) => `<a class="btn ${scope === id ? 'btn-primary' : ''}" href="#/dnslog?scope=${id}">${label}</a>`).join(' ')}<span class="demo-hint">Guest Wireless is 192.168.5.0/24; LAN is 192.168.1.0/24.</span></div>`;
			if (devMac) {
				const dev = d.devices.find(x => x.mac === devMac);
				if (!dev) return pageHead('DNS Log', 'Device not found in the current window.') + card('No data', empty('No device found', 'This mock log has no queries for that device.', 'i-log'));
				const devQueries = d.queries.filter(q => q.device === dev.mac);
				const devScope = isGuest(dev.ip) ? 'Guest Wireless' : 'LAN';
				return pageHead(dev.name, `Per-device DNS history for ${dev.ip}. The real log keeps the current 12-hour window.`) +
					`<div class="demo-actions" style="margin:-8px 0 18px">${btn('← All devices', 'dns-back', { data: { scope: devScope === 'Guest Wireless' ? 'guest' : 'lan' } })}</div>` +
					`<div class="demo-stats"><div class="demo-stat"><b>${dev.queries}</b><span>Queries</span></div><div class="demo-stat"><b>${dev.domains}</b><span>Domains</span></div><div class="demo-stat"><b>${dev.mac}</b><span>Device</span></div></div>` +
					card('Top domains', kv([['Scope', devScope], ['Top domains', esc(dev.top)], ['Category', badge(dev.category, categoryTone(dev.category))], ['First seen', 'Nov 23 08:01:07'], ['Last seen', esc(dev.last)]])) +
					card('Recent queries', table([th('Time'), th('Type'), th('Client'), th('Category'), th('Domain')], devQueries.length ? devQueries.map(q => [td(q.time, 'mono'), td(badge(q.type, 'plain')), td(q.client, 'mono'), td(badge(q.category, categoryTone(q.category))), td(q.domain, 'mono')]) : [td(empty('No queries for this device', 'The demo has no records in this window.', 'i-log'))]));
			}
			const cats = [...new Set(devices.map(x => x.category))].sort();
			const rows = devices.map(x => ({
				attrs: ` data-search="${esc((x.mac + ' ' + x.name + ' ' + x.ip + ' ' + x.top).toLowerCase())}" data-cat="${esc(x.category)}"`,
				cells: [
					td(`<button type="button" class="demo-link" data-action="dns-device" data-mac="${esc(x.mac)}">${esc(x.mac)}</button><span class="demo-sub">${esc(x.name)}</span>`),
					td(x.ip, 'mono'), td(String(x.queries), 'right mono'), td(String(x.domains), 'right mono'),
					td(badge(x.category, categoryTone(x.category))), td(esc(x.top)), td(x.last, 'mono')
				]
			}));
			const summary = scope === 'all' ? d.summary : { queries: queries.length, devices: devices.length, domains: new Set(queries.map(q => q.domain)).size, blocked: d.summary.blocked };
			return pageHead('DNS Query Log', 'Per-device DNS history from dnsmasq. Click a device to see only its queries. Categories are matched locally from the nDPI table.') +
				scopeTabs +
				`<div class="demo-stats"><div class="demo-stat"><b>${summary.queries}</b><span>Queries</span></div><div class="demo-stat"><b>${summary.devices}</b><span>Devices</span></div><div class="demo-stat"><b>${summary.domains}</b><span>Domains</span></div><div class="demo-stat"><b>${summary.blocked}</b><span>Blocked hits</span></div></div>` +
				`<div class="demo-toolbar"><div class="demo-search"><input id="dns-filter" type="search" placeholder="Filter queries by client, MAC, type or domain" aria-label="Filter DNS devices"></div><select id="dns-cat" aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select><button type="button" class="btn" data-action="dns-download">Download</button><button type="button" class="btn" data-action="dns-copy">Copy log</button><button type="button" class="btn" data-action="dns-refresh">Refresh</button></div>` +
				card('Devices (' + devices.length + ')', table([th('Device'), th('IP'), th('Queries', 'right'), th('Domains', 'right'), th('Category'), th('Top domains'), th('Last seen')], rows), 'the demo window is fixed') +
				card('Recent queries', table([th('Time'), th('Type'), th('Client'), th('Device'), th('Category'), th('Domain')], queries.map(q => [td(q.time, 'mono'), td(badge(q.type, 'plain')), td(q.client, 'mono'), td(q.device, 'mono'), td(badge(q.category, categoryTone(q.category))), td(q.domain, 'mono')])));
		},
		init() {
			actions['dns-back'] = el => { location.hash = '#/dnslog?scope=' + (el?.dataset.scope || 'all'); };
			actions['dns-device'] = el => { location.hash = '#/dnslog?dev=' + encodeURIComponent(el.dataset.mac); };
			actions['dns-refresh'] = () => toast('DNS log refreshed (mock).');
			actions['dns-copy'] = () => copyText(state.dns.devices.map(x => `${x.mac}\t${x.ip}\t${x.queries}\t${x.domains}\t${x.category}`).join('\n'), 'Device table copied.');
			actions['dns-download'] = () => downloadText('dns-devices.csv', 'device,mac,ip,queries,domains,category\n' + state.dns.devices.map(x => [x.name, x.mac, x.ip, x.queries, x.domains, x.category].join(',')).join('\n'), 'text/csv');
			const filter = $('#dns-filter');
			const cat = $('#dns-cat');
			const apply = () => {
				const q = filter ? filter.value.trim().toLowerCase() : '';
				const c = cat ? cat.value : '';
				$$('#maincontent tr[data-search]').forEach(row => {
					row.hidden = (q && !row.dataset.search.includes(q)) || (c && row.dataset.cat !== c);
				});
			};
			if (filter) filter.addEventListener('input', apply);
			if (cat) cat.addEventListener('change', apply);
		}
	};

	/* ------------------------------------------------------------ network log */
	views.networklog = {
		title: 'Network Log',
		render(params) {
			const scope = ['all', 'lan', 'guest'].includes(params.get('scope')) ? params.get('scope') : 'all';
			const lines = state.networklog.filter(l => scope === 'all' || l.scope === scope);
			const cats = [...new Set(lines.map(l => l.cat))].sort();
			const tabs = [['all', 'All'], ['lan', 'LAN'], ['guest', 'Guest Wireless']]
				.map(([id, label]) => `<a class="btn ${scope === id ? 'btn-primary' : ''}" href="#/networklog?scope=${id}">${label}</a>`).join(' ');
			const stats = `<div class="demo-stats">${cats.map(c => `<div class="demo-stat"><b>${lines.filter(l => l.cat === c).length}</b><span>${esc(c)}</span></div>`).join('')}</div>`;
			const rows = lines.slice().reverse().map(l => [td(l.time, 'mono'), td(badge(l.cat, 'plain')), td(esc(l.msg))]);
			return pageHead('Network Log', 'Interface, DHCP/DNS, WiFi and firewall events. The real page reads the 2 MB system-log ring buffer.') +
				`<div class="demo-actions" style="margin:-8px 0 18px">${tabs}<span class="demo-hint">Guest Wireless is 192.168.5.0/24 / br-guest; LAN is 192.168.1.0/24 / br-lan.</span></div>` +
				stats +
				card('Events', lines.length ? table([th('Time'), th('Category'), th('Message')], rows) : empty('No events', 'No network events in this scope.', 'i-log'), `${lines.length} mock events`);
		}
	};

	/* ------------------------------------------------------------ logs */
	views.logs = {
		title: 'Service Logs',
		render(params) {
			const groups = state.logs.groups;
			const labels = SERVICE_LOG_LABELS;
			const group = labels[params.get('group')] ? params.get('group') : 'system';
			const lines = groups[group] || [];
			const options = Object.keys(labels).map(k => `<option value="${k}" ${k === group ? 'selected' : ''}>${labels[k]}</option>`).join('');
			return pageHead('Service Logs', 'Filtered views of the system log for each service. The real pages read logd’s 2 MB ring buffer.') +
				`<div class="demo-toolbar"><select id="logs-group" aria-label="Log group">${options}</select><div class="demo-search"><input id="logs-filter" type="search" placeholder="Filter log lines" aria-label="Filter log lines"></div><div class="demo-toolbar-spacer"></div><button type="button" class="btn" data-action="logs-download">Download</button><button type="button" class="btn" data-action="logs-copy">Copy log</button><button type="button" class="btn" data-action="logs-refresh">Refresh</button></div>` +
				card(labels[group], `<div class="demo-log" id="logs-pre">${lines.map(l => `<span class="demo-log-line">${esc(l)}</span>`).join('') || 'No entries.'}</div>`, `${lines.length} mock lines`);
		},
		init(params) {
			const labels = SERVICE_LOG_LABELS;
			const group = labels[params.get('group')] ? params.get('group') : 'system';
			const lines = state.logs.groups[group] || [];
			const sel = $('#logs-group');
			if (sel) sel.addEventListener('change', () => { location.hash = '#/logs?group=' + encodeURIComponent(sel.value); });
			const filter = $('#logs-filter');
			if (filter) filter.addEventListener('input', () => {
				const q = filter.value.trim().toLowerCase();
				const shown = lines.filter(l => !q || l.toLowerCase().includes(q));
				$('#logs-pre').innerHTML = shown.length ? shown.map(l => `<span class="demo-log-line">${esc(l)}</span>`).join('') : 'No entries match the filter.';
			});
			actions['logs-refresh'] = () => toast('Log refreshed (mock).');
			actions['logs-copy'] = () => copyText(lines.join('\n'), 'Log copied.');
			actions['logs-download'] = () => downloadText(`${group}.log`, lines.join('\n') + '\n');
		}
	};

	/* ------------------------------------------------------------ modem */
	views.modem = {
		title: 'Sim Modem',
		render() {
			const m = state.modem;
			const actionsBar = `${btn(m.active ? 'Park SIM' : 'Wake SIM', 'modem-toggle', { primary: !m.active })}${btn('Restart modem', 'modem-restart')}`;
			const status = `<div class="demo-kv">
				<div><span>SIM state</span><b>${badge(m.active ? 'active' : 'parked', m.active ? 'ok' : 'warn')}</b></div>
				<div><span>Registration</span><b>${esc(m.registration)}</b></div>
				<div><span>Operator</span><b>${esc(m.operator)}</b></div>
				<div><span>Technology</span><b>${esc(m.technology)}</b></div>
				<div><span>Signal</span><b>${m.signal}%</b></div>
				<div><span>Band</span><b class="mono">${esc(m.band)}</b></div>
				<div><span>Temperature</span><b>${esc(m.temperature)}</b></div>
				<div><span>APN</span><b class="mono">${esc(m.apn)}</b></div>
			</div>`;
			const conn = m.active ? `<div class="demo-kv">
				<div><span>Interface</span><b class="mono">${esc(m.interface)}</b></div>
				<div><span>Device</span><b class="mono">${esc(m.device)}</b></div>
				<div><span>IPv4</span><b class="mono">${esc(m.ip)}</b></div>
				<div><span>Gateway</span><b class="mono">${esc(m.gateway)}</b></div>
				<div><span>DNS</span><b class="mono">${m.dns.join(' · ')}</b></div>
			</div>` : empty('SIM is parked', 'The modem is intentionally down while the ISP carries traffic. Wake it to show the connection.', 'i-signal');
			return pageHead('Sim Modem', 'Cellular uplink status and connection details. The SIM is the standby path; identifiers are withheld in this demo.', actionsBar) +
				card('Status', `${status}${meter('Signal strength', m.signal + '%', m.signal, m.signal < 40 ? 'is-warn' : '')}`, 'mock radio state') +
				card('Connection', conn) +
				card('Demo note', '<p class="demo-desc" style="margin:0">No IMEI, IMSI, ICCID or AT commands are shown. In the real console this page reports the modem’s registration, signal and PDP context.</p>');
		},
		init() {
			actions['modem-toggle'] = () => {
				state.modem.active = !state.modem.active;
				toast(`SIM ${state.modem.active ? 'awake and connected' : 'parked'} (mock).`); render();
			};
			actions['modem-restart'] = () => toast('Modem restart requested (mock).');
		}
	};

	/* ------------------------------------------------------------ vpn split */
	views.vpnsplit = {
		title: 'VPN Split Tunnel',
		render() {
			const v = state.vpnsplit;
			return pageHead('VPN Split Tunnel', 'Send only the listed domains and IPs through the WireGuard tunnel. Everything else keeps using the ISP.', `${btn('Add entry', 'vpn-add', { primary: true })}${btn('Reload set', 'vpn-reload')}`) +
				`<div class="demo-status-strip"><span class="dot dot-ok"></span><b>wgvpn · up · handshake ${esc(v.handshake)}</b><span>${v.entries} entries</span><span>table 100 route present</span></div>` +
				card('Split-tunnel entries', table([th('Entry'), th('Type'), th('State'), th('', 'right')], v.rules.map((r, i) => [
					td(`<b>${esc(r.value)}</b>`), td(r.kind, 'mono'), td(badge(r.enabled ? 'enabled' : 'disabled', r.enabled ? 'ok' : 'plain')),
					td(`<div class="demo-table-actions">${btn(r.enabled ? 'Disable' : 'Enable', 'vpn-toggle', { data: { index: i } })}${btn('Remove', 'vpn-remove', { data: { index: i } })}</div>`)
				])), 'the demo set is fixed') +
				card('Status', kv([['Tunnel', 'wgvpn'], ['Policy rule', 'fwmark 0x1 lookup 100'], ['Table 100', 'default dev wgvpn'], ['Blackhole', 'when the tunnel is down']]));
		},
		init() {
			actions['vpn-reload'] = () => toast('Split-tunnel set reloaded (mock).');
			actions['vpn-toggle'] = el => { const r = state.vpnsplit.rules[Number(el.dataset.index)]; r.enabled = !r.enabled; toast(`${r.value} ${r.enabled ? 'enabled' : 'disabled'}.`); render(); };
			actions['vpn-remove'] = el => { state.vpnsplit.rules.splice(Number(el.dataset.index), 1); toast('Entry removed.'); render(); };
			actions['vpn-add'] = () => openModal('Add a split-tunnel entry', `<form data-form="vpn-new" class="demo-form-grid">
				${field('Domain or IP', '<input class="cbi-input-text mono" name="value" placeholder="example.com or 198.51.100.0/24" required>')}
				${field('Type', '<select class="cbi-input-select" name="kind"><option>domain</option><option>IP</option><option>CIDR</option></select>')}
				${modalActions('Cancel', 'Add entry')}
			</form>`, {}, {
				'vpn-new': data => {
					if (!data.value) { toast('Enter a domain or IP.', 'warn'); return; }
					state.vpnsplit.rules.push({ value: data.value, kind: data.kind, enabled: true });
					closeModal(); toast('Entry added.'); render();
				}
			});
		}
	};

	/* ------------------------------------------------------------ cloudflare */
	views.cloudflare = {
		title: 'Cloudflare',
		render(params) {
			const tab = params.get('tab') || 'ddns';
			const c = state.cloudflare;
			const tabs = tabbar('cloudflare', [['ddns', 'Dynamic DNS'], ['tunnels', 'Tunnels']], tab);
			if (tab === 'tunnels') {
				return pageHead('Cloudflare', 'Cloudflare DDNS and tunnel connectors under procd.', btn('Refresh', 'cf-refresh')) + tabs +
					card('Tunnel connectors', table([th('Name'), th('UUID'), th('Connections'), th('Uptime'), th('State'), th('', 'right')], c.tunnels.map((t, i) => [
						td(`<b>${esc(t.name)}</b>`), td(t.uuid, 'mono'), td(String(t.connected), 'right mono'), td(t.uptime, 'mono'),
						td(badge(t.enabled ? 'connected' : 'disabled', t.enabled ? 'ok' : 'plain')),
						td(`<div class="demo-table-actions">${btn(t.enabled ? 'Disable' : 'Enable', 'cf-toggle', { data: { index: i } })}</div>`)
					])), 'ingress hostnames are stored in the Cloudflare dashboard') +
					card('Tunnel token', '<p class="demo-desc" style="margin:0">The connector token is stored in a 0600 file on the router and is never shown here. This demo has no token field.</p>');
			}
			return pageHead('Cloudflare', 'Dynamic DNS and tunnel connectors. Tokens stay in 0600 files on the router.', `${btn('Update now', 'cf-update', { primary: true })}${btn('Refresh', 'cf-refresh')}`) + tabs +
				`<div class="demo-status-strip"><span class="dot dot-ok"></span><b>DDNS active</b><span>provider ${esc(c.provider)}</span><span>last update ${esc(c.updated)}</span></div>` +
				card('DNS records', table([th('Name'), th('Type'), th('Value'), th('Proxied'), th('')], c.records.map(r => [
					td(`<b>${esc(r.name)}</b>`), td(r.type, 'mono'), td(r.value, 'mono'), td(r.proxied ? badge('proxied', 'warn') : badge('DNS only', 'plain')), td(btn('Check', 'cf-check'))
				])), 'vpn.example.com stays DNS-only so UDP can traverse') +
				card('Settings', `<form data-form="cf-save" class="demo-form-grid">
					${field('API token', '<input class="cbi-input-text" type="password" value="" placeholder="present in /etc/cloudflare-ddns.token" disabled>', 'The demo never receives or displays a token.')}
					${field('Update interval', '<input class="cbi-input-text mono" value="5 minutes" disabled>')}
					<div class="demo-form-actions full"><button type="submit" class="btn btn-primary">Save settings</button></div>
				</form>`);
		},
		init() {
			actions['cf-update'] = () => { state.cloudflare.updated = 'just now'; toast('DDNS update requested (mock).'); render(); };
			actions['cf-refresh'] = () => toast('Cloudflare status refreshed (mock).');
			actions['cf-check'] = () => toast('Record check OK (mock).');
			actions['cf-toggle'] = el => { const t = state.cloudflare.tunnels[Number(el.dataset.index)]; t.enabled = !t.enabled; toast(`${t.name} ${t.enabled ? 'enabled' : 'disabled'} (mock).`); render(); };
			forms['cf-save'] = () => toast('Cloudflare settings saved (mock).');
		}
	};

	/* ------------------------------------------------------------ wifi */
	views.wifi = {
		title: 'WiFi configuration',
		render() {
			return pageHead('WiFi configuration', 'The vendor MediaTek Wi-Fi stack. SSIDs and radios live in the mt7915 data files, not UCI wireless.') +
				`<div class="demo-radio-grid">${state.wifi.map((w, i) => card(`${w.band}`, `<div class="demo-port-head"><span class="dot ${w.enabled ? 'dot-ok' : ''}"></span><span class="demo-port-name">${esc(w.ssid)}</span><span class="demo-port-speed">${w.enabled ? 'up' : 'disabled'}</span></div>${kv([['Band / channel', `${w.band} · channel ${w.channel}`], ['Security', w.security], ['Wi-Fi standard', w.mode], ['Guest network', w.guest ? 'isolated · internet only' : 'no'], ['Clients', String(w.clients)]])}<div class="demo-form-actions">${btn('Edit', 'wifi-edit', { data: { index: i } })}${btn(w.enabled ? 'Disable' : 'Enable', 'wifi-toggle', { data: { index: i } })}</div>`)).join('')}</div>` +
				card('Guest network', `<p class="demo-desc">Tick <b>Guest network</b> on an SSID to move it to the isolated <code>br-guest</code> bridge (192.168.5.0/24). Guests get internet access and the captive portal, but cannot reach the LAN. The main SSID stays on <code>br-lan</code>.</p><a class="btn" href="#/captive">Open Captive Portal</a>`);
		},
		init() {
			actions['wifi-toggle'] = el => { const w = state.wifi[Number(el.dataset.index)]; w.enabled = !w.enabled; toast(`${w.band} radio ${w.enabled ? 'enabled' : 'disabled'} (mock).`); render(); };
			actions['wifi-edit'] = el => {
				const w = state.wifi[Number(el.dataset.index)];
				openModal(`Edit ${w.band}`, `<form data-form="wifi-save" class="demo-form-grid">
					<input type="hidden" name="id" value="${esc(w.id)}">
					${field('SSID', `<input class="cbi-input-text" name="ssid" value="${esc(w.ssid)}">`)}
					${field('Channel', `<input class="cbi-input-text mono" name="channel" value="${w.channel}">`)}
					${field('Guest network', `<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="guest" value="1" ${w.guest ? 'checked' : ''}> <span>Isolated 192.168.5.0/24 bridge — internet only, no LAN access.</span></label>`, '', 'full')}
					${modalActions('Cancel', 'Save')}
				</form>`, {}, {
					'wifi-save': data => {
						const target = state.wifi.find(x => x.id === data.id);
						if (target) { target.ssid = data.ssid || target.ssid; target.channel = data.channel || target.channel; target.guest = !!data.guest; }
						closeModal(); toast('Wi-Fi settings saved (mock).'); render();
					}
				});
			};
		}
	};

	/* ------------------------------------------------------------ guest wireless */
	views.guest = {
		title: 'Guest Wireless',
		render(params) {
			const g = state.guest;
			const c = state.captive;
			const tab = params.get('tab') || 'overview';
			const tabs = tabbar('guest', [['overview', 'Overview'], ['devices', 'Devices'], ['logs', 'Logs']], tab);
			const portal = c.enabled && c.gateIface === 'br-guest';
			const guests = state.devices.map((d, i) => ({ d, i })).filter(({ d }) => String(d.ip || '').startsWith('192.168.5.'));
			let content = '';

			if (tab === 'devices') {
				const blocked = guests.filter(({ d }) => d.blocked).length;
				const rows = guests.map(({ d, i }) => [
					td(d.ip || '—', 'mono'), td(d.mac, 'mono'), td(`<b>${esc(d.host)}</b>`), td(esc(d.vendor)),
					td(d.via), td(badge(d.blocked ? 'blocked' : 'allowed', d.blocked ? 'danger' : 'ok')),
					td(btn(d.blocked ? 'Unblock' : 'Block', 'guest-toggle', { data: { index: i } }))
				]);
				content = `<div class="demo-stats"><div class="demo-stat"><b>${guests.length}</b><span>guest devices</span></div><div class="demo-stat ${blocked ? 'is-danger' : ''}"><b>${blocked}</b><span>blocked</span></div></div>
					<div class="demo-toolbar"><span class="demo-hint">Devices on 192.168.5.0/24 and br-guest</span><div class="demo-toolbar-spacer"></div>${btn('Scan guest network', 'guest-refresh')}${btn('Refresh', 'guest-refresh')}</div>` +
					card('Connected guest devices', guests.length ? table([
						th('IP address'), th('MAC address'), th('Hostname'), th('Manufacturer'), th('Seen via'), th('State'), th('', 'right')
					], rows) : empty('No guest devices', 'Guests appear here after they get a DHCP lease or associate with a guest SSID.', 'i-devices'), `${guests.length} shown`) +
					`<p class="demo-desc">Blocking adds a parental rule for the device MAC. Devices exempted in Parental Control are never blocked.</p>`;
			} else if (tab === 'logs') {
				const accepts = c.acceptances.filter(a => String(a[1] || '').startsWith('192.168.5.')).slice().reverse();
				const unique = new Set(accepts.map(a => a[2])).size;
				const last = accepts.length ? accepts[0][0] : '—';
				const rows = accepts.map(a => [
					td(a[0], 'mono'), td(a[1], 'mono'), td(a[2], 'mono'), td(esc(a[5] || '—')),
					td(a[3]), td(esc(a[4] || '—'))
				]);
				content = `<div class="demo-stats"><div class="demo-stat"><b>${accepts.length}</b><span>recent acceptances</span></div><div class="demo-stat"><b>${unique}</b><span>unique devices</span></div><div class="demo-stat"><b class="mono" style="font-size:13px">${esc(last)}</b><span>last acceptance</span></div></div>
					<div class="demo-toolbar"><span class="demo-hint">/data/portal/accept.log</span><div class="demo-toolbar-spacer"></div>${btn('Download raw log', 'guest-log-download')}${btn('Refresh', 'guest-refresh')}</div>` +
					card('Acceptances', rows.length ? table([
						th('Time'), th('IP address'), th('MAC address'), th('Vendor'), th('Country'), th('Requested page')
					], rows) : empty('No guest acceptances yet', 'Guests who accept the terms will appear here.', 'i-log'), 'newest first') +
					`<p class="demo-desc">Vendor comes from the local OUI table. A dash means the MAC is randomised or not in the table.</p>`;
			} else {
				const ssids = state.wifi.filter(w => w.guest);
				const status = card('Status', `<div class="demo-kv">
					<div><span>Guest wireless</span><b><span class="dot ${g.enabled ? 'dot-ok' : 'dot-warn'}"></span> ${g.enabled ? 'enabled — isolated on ' + g.bridge : 'disabled — guest SSIDs taken down'}</b></div>
					<div><span>Guest bridge</span><b class="mono">${g.bridge} · ${g.subnet}</b></div>
					<div><span>DHCP</span><b class="mono">${g.dhcp}</b></div>
					<div><span>Captive portal</span><b><span class="dot ${portal ? 'dot-ok' : 'dot-warn'}"></span> ${portal ? 'enabled — gated on ' + g.bridge : 'disabled — guests go straight online'}</b></div>
					<div><span>Members</span><b class="mono">${g.members.join(', ') || 'none'}</b></div>
				</div>`);
				const ssidTable = ssids.length ? table([th('SSID'), th('Band'), th('Wi-Fi standard'), th('Clients')], ssids.map(w => [td(esc(w.ssid)), td(w.band), td(w.mode), td(String(w.clients))])) : empty('No guest SSIDs', 'Tick Guest network on an SSID in Wi-Fi configuration.', 'i-wifi');
				const form = `<form data-form="guest-save" class="demo-form-grid">
					<div class="cbi-value full"><label class="cbi-value-title">Guest wireless enabled</label><div class="cbi-value-field">${checkbox('enabled', 'Guest VIFs are isolated on br-guest', g.enabled)}</div></div>
					<div class="cbi-value full"><label class="cbi-value-title">Captive portal for guests</label><div class="cbi-value-field">${checkbox('portal', 'Redirect guests to the terms page before internet access', portal)}</div></div>
					<div class="cbi-value full"><div class="cbi-value-field"><p class="demo-desc" style="margin:0">The guest SSID list is set by the <b>Guest network</b> checkbox in <a href="#/wifi">Wi-Fi configuration</a>. This page only turns the guest network and its portal on or off.</p></div></div>
					<div class="demo-form-actions full"><button type="submit" class="btn btn-primary">Save &amp; apply</button></div>
				</form>`;
				content = status + card('Guest SSIDs (' + ssids.length + ')', ssidTable) + card('Settings', form);
			}

			return pageHead('Guest Wireless', 'An isolated guest network on its own bridge and subnet: internet only, no LAN.') +
				tabs + content;
		},
		init() {
			forms['guest-save'] = data => {
				state.guest.enabled = !!data.enabled;
				state.captive.enabled = !!data.portal;
				state.captive.gateIface = 'br-guest';
				toast('Guest wireless settings saved (mock).');
				render();
			};
			actions['guest-toggle'] = el => {
				const d = state.devices[Number(el.dataset.index)];
				d.blocked = !d.blocked;
				toast(`${d.host} is now ${d.blocked ? 'blocked' : 'allowed'}.`);
				render();
			};
			actions['guest-refresh'] = () => toast('Guest network refreshed (mock).');
			actions['guest-log-download'] = () => toast('Acceptance log downloaded (mock).');
		}
	};

	/* ------------------------------------------------------------ theme */
	views.theme = {
		title: 'Theme',
		render() {
			return pageHead('Theme', 'The router ships two themes. The console is active; the stock Bootstrap theme is the untouched fallback.') +
				`<div class="demo-grid two">
					${card('AW1000 Console', `<div class="demo-status-strip"><span class="dot dot-ok"></span><b>Active</b><span>graphite rail · bone canvas · jade signal</span></div><div style="display:flex;gap:8px;margin:4px 0 16px"><span style="width:34px;height:34px;border-radius:8px;background:#0E1412"></span><span style="width:34px;height:34px;border-radius:8px;background:#F4F5F1;border:1px solid #E2E6DE"></span><span style="width:34px;height:34px;border-radius:8px;background:#0E7A6E"></span><span style="width:34px;height:34px;border-radius:8px;background:#57D8BE"></span></div><p class="demo-desc">The full console theme: live overview, WAN strip, dense tables, responsive drawer and a matching login page.</p>${btn('Keep this theme', 'theme-switch', { primary: true })}`)}
					${card('Stock Bootstrap', `<div class="demo-status-strip" style="background:#F4F6F1;border-color:#E2E6DE;color:#66736D"><span class="dot"></span><b>Not included in this demo</b><span>the firmware fallback</span></div><p class="demo-desc">The real router can switch to the stock theme from <b>System → Theme</b>. This static demo only ships the console look.</p>${btn('Explain switch', 'theme-stock')}`)}
				</div>` +
				card('Demo controls', `<p class="demo-desc">Changes you make in this demo are kept in memory. Reset them to the original fictional data at any time.</p><div class="demo-form-actions" style="justify-content:flex-start">${btn('Reset demo data', 'demo-reset')}</div>`);
		},
		init() {
			actions['theme-switch'] = () => toast('This demo stays on the AW1000 Console theme.');
			actions['theme-stock'] = () => toast('On the router: System → Theme, or set luci.main.mediaurlbase to /luci-static/bootstrap.');
			actions['demo-reset'] = resetDemo;
		}
	};

	/* Stock menu pages share one compact renderer. */
	Object.keys(STOCK_PAGES).forEach(id => { views[id] = stockView(id); });

	/* Realtime Graphs mirrors the vendor Load / Traffic / Wireless / Connections tabs. */
	views.realtime = {
		title: 'Realtime Graphs',
		render(params) {
			const tabs = [['load', 'Load'], ['traffic', 'Traffic'], ['wireless', 'Wireless'], ['connections', 'Connections']];
			const tab = tabs.some(t => t[0] === params.get('tab')) ? params.get('tab') : 'load';
			const titles = { load: 'Load', traffic: 'Traffic', wireless: 'Wireless', connections: 'Connections' };
			const d = state.realtimeTabs[tab] || state.realtimeTabs.load;
			let body = '';
			if (d.meters) body = d.meters.map(m => meter(esc(m[0]), esc(m[1]), m[2], m[3] || '')).join('');
			if (d.table) body = etable(d.table.headers, d.table.rows);
			return pageHead('Realtime Graphs', 'Live load, traffic, wireless and connection graphs. The real pages poll every 5 seconds.') +
				tabbar('realtime', tabs, tab) +
				card(esc(titles[tab] || 'Load'), body, esc(d.note || ''));
		}
	};

	/* ------------------------------------------------------------ router shell */
	function parseHash() {
		const raw = location.hash.replace(/^#\/?/, '') || 'overview';
		const [id, qs] = raw.split('?');
		return { id: id || 'overview', params: new URLSearchParams(qs || '') };
	}
	function render() {
		closeModal();
		const { id, params } = parseHash();
		const routeId = views[id] ? id : 'overview';
		const view = views[routeId];
		currentRoute = { id: routeId, params };
		actions = {};
		forms = {};
		const html = view.render(params);
		$('#maincontent').innerHTML = `<div id="view">${html}</div>`;
		const info = NAV_INDEX[routeId] || { group: 'status', label: view.title, groupLabel: 'Status' };
		updateNav(routeId);
		$('#crumb').innerHTML = routeId === 'overview'
			? `<span>${esc(info.groupLabel)}</span>`
			: `<a href="${href('overview')}">${esc(info.groupLabel)}</a><span class="crumb-sep">/</span><span>${esc(info.label)}</span>`;
		document.title = `${view.title} · AW1000 Console demo`;
		if (view.init) view.init(params);
		window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
		if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
		closeMobileNav();
	}

	document.addEventListener('click', e => {
		const el = e.target.closest('[data-action]');
		if (!el) return;
		const fn = actions[el.dataset.action];
		if (!fn) return;
		e.preventDefault();
		fn(el, e);
	});
	document.addEventListener('submit', e => {
		const form = e.target.closest('form[data-form]');
		if (!form) return;
		const fn = forms[form.dataset.form];
		if (!fn) return;
		e.preventDefault();
		fn(Object.fromEntries(new FormData(form)), form);
	});
	document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

	initShell();
	window.addEventListener('hashchange', render);
	render();
})();
