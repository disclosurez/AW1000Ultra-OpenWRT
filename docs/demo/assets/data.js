/* Fictional demo data. No live router values, client records or secrets. */
window.DEMO_DATA = {
	host: { name: 'AW1000-Ultra', model: 'AW1000 ULTRA', firmware: 'OpenWrt 19.07.7', lan: '192.168.1.1' },
	wan: {
		ip: '203.0.113.10', gateway: '203.0.113.1',
		dns: ['203.0.113.53', '203.0.113.54'],
		uptime: '3h 12m', rx: '1.15 GB', tx: '434.9 MB'
	},
	clients: 8,
	interfaces: [
		{ name: 'isp', label: 'ISP', proto: 'DHCP client', device: 'eth1', uptime: '3h 12m', ipv4: '203.0.113.10/24', mac: '02:00:00:00:00:01', state: 'In use', tone: 'ok', metric: 10 },
		{ name: 'wan', label: 'SIM', proto: 'MIPC', device: 'ccmni3', uptime: '—', ipv4: '—', mac: '—', state: 'Parked', tone: 'warn', metric: 50 },
		{ name: 'wan6', label: 'SIM6', proto: 'DHCPv6', device: 'ccmni', uptime: '—', ipv4: '—', mac: '—', state: 'Parked', tone: 'warn', metric: 50 },
		{ name: 'lan', label: 'LAN', proto: 'Static address', device: 'br-lan', uptime: '2d 4h', ipv4: '192.168.1.1/24', mac: '02:00:00:00:00:02', state: 'Up', tone: 'ok', metric: 0 },
		{ name: 'wghome', label: 'Home VPN', proto: 'WireGuard', device: 'wghome', uptime: '1h 06m', ipv4: '10.0.0.4/32', mac: '02:00:00:00:00:03', state: 'Up', tone: 'ok', metric: 0 }
	],
	ports: [
		{ id: 'lan1', name: 'LAN1', state: 'up', speed: '1 Gbit/s · full duplex', rx: '2.4 MB/s', tx: '480 KB/s', devices: [['work-laptop', '192.168.1.33'], ['printer', '192.168.1.66']] },
		{ id: 'lan2', name: 'LAN2', state: 'down', speed: 'no link', rx: '0 B/s', tx: '0 B/s', devices: [] },
		{ id: 'lan3', name: 'LAN3', state: 'up', speed: '100 Mbit/s · full duplex', rx: '112 KB/s', tx: '38 KB/s', devices: [['living-room-tv', '192.168.1.21']] },
		{ id: 'lan4', name: 'LAN4', state: 'down', speed: 'no link', rx: '0 B/s', tx: '0 B/s', devices: [] },
		{ id: 'wifi5', name: 'Wi-Fi 5 GHz', state: 'up', speed: '1201 Mbit/s', rx: '18.2 MB/s', tx: '4.1 MB/s', devices: [['phone', '192.168.1.44'], ['kids-tablet', '192.168.1.22']] },
		{ id: 'wifi24', name: 'Wi-Fi 2.4 GHz', state: 'up', speed: '574 Mbit/s', rx: '3.4 MB/s', tx: '812 KB/s', devices: [['living-room-tv', '192.168.1.21'], ['nas', '192.168.1.55']] },
		{ id: 'usb', name: 'USB tethering', state: 'down', speed: 'not connected', rx: '0 B/s', tx: '0 B/s', devices: [] }
	],
	devices: [
		{ host: 'living-room-tv', ip: '192.168.1.21', mac: '02:00:00:00:00:21', vendor: 'Example TV', via: 'DHCP', blocked: true, up: '1.2 MB', down: '18.4 MB', ports: '80, 443' },
		{ host: 'kids-tablet', ip: '192.168.1.22', mac: '02:00:00:00:00:22', vendor: 'Example Tablet', via: 'DHCP', blocked: false, scheduled: true, up: '4.6 MB', down: '31.2 MB', ports: '443' },
		{ host: 'work-laptop', ip: '192.168.1.33', mac: '02:00:00:00:00:33', vendor: 'Example Laptop', via: 'DHCP', blocked: false, up: '12.8 MB', down: '84.1 MB', ports: '22, 443' },
		{ host: 'phone', ip: '192.168.1.44', mac: '02:00:00:00:00:44', vendor: 'Example Phone', via: 'DHCP', blocked: false, up: '3.1 MB', down: '22.7 MB', ports: '443' },
		{ host: 'nas', ip: '192.168.1.55', mac: '02:00:00:00:00:55', vendor: 'Example NAS', via: 'static', blocked: false, up: '—', down: '—', ports: '22, 445, 5000' },
		{ host: 'printer', ip: '192.168.1.66', mac: '02:00:00:00:00:66', vendor: 'Example Printer', via: 'ARP', blocked: false, up: '—', down: '—', ports: '80, 9100' },
		{ host: 'guest-phone', ip: '192.168.5.42', mac: '02:00:00:00:00:99', vendor: 'Example Phone', via: 'Guest', blocked: false, up: '1.4 MB', down: '9.8 MB', ports: '443' }
	],
	rules: [
		{ name: 'Kids tablet', mac: '02:00:00:00:00:AA', mode: 'scheduled', window: '08:00-20:00', days: 'Mon-Fri', state: 'allowed' },
		{ name: 'Guest phone', mac: '02:00:00:00:00:BB', mode: 'ban', window: '—', days: 'Every day', state: 'blocked' }
	],
	domains: [
		{ domain: 'social.example', target: 'all', window: '18:00-22:00', enabled: true },
		{ domain: 'video.example', target: '02:00:00:00:00:AA', window: 'always', enabled: true },
		{ domain: 'ads.example', target: 'all', window: 'always', enabled: false }
	],
	dns: {
		summary: { queries: 53, devices: 6, domains: 20, blocked: 0 },
		devices: [
			{ mac: '02:00:00:00:00:21', name: 'Example TV', ip: '192.168.1.21', queries: 24, domains: 8, category: 'Streaming', tone: 'accent', top: 'netflix.example, youtube.example, spotify.example', last: 'Nov 23 08:12:11' },
			{ mac: '02:00:00:00:00:22', name: 'Example Tablet', ip: '192.168.1.22', queries: 12, domains: 5, category: 'Social', tone: 'accent', top: 'chat.example, social.example, mail.example', last: 'Nov 23 08:11:42' },
			{ mac: '02:00:00:00:00:33', name: 'Example Laptop', ip: '192.168.1.33', queries: 8, domains: 3, category: 'Software', tone: 'plain', top: 'updates.example, cdn.example, api.example', last: 'Nov 23 08:08:09' },
			{ mac: '02:00:00:00:00:44', name: 'Example Phone', ip: '192.168.1.44', queries: 3, domains: 2, category: 'Infrastructure', tone: 'warn', top: 'time.example, dns.example', last: 'Nov 23 08:04:31' },
			{ mac: '02:00:00:00:00:55', name: 'Example NAS', ip: '192.168.1.55', queries: 1, domains: 1, category: 'Web', tone: 'plain', top: 'example.com', last: 'Nov 23 08:01:07' },
			{ mac: '02:00:00:00:00:99', name: 'Guest phone', ip: '192.168.5.42', queries: 5, domains: 2, category: 'Social', tone: 'accent', top: 'chat.example, maps.example', last: 'Nov 23 08:13:21' }
		],
		queries: [
			{ device: '02:00:00:00:00:21', time: 'Nov 23 08:13:53', type: 'A', client: '192.168.1.21', category: 'Cloud / CDN', domain: 'cdn.example' },
			{ device: '02:00:00:00:00:22', time: 'Nov 23 08:13:44', type: 'A', client: '192.168.1.22', category: 'Social', domain: 'chat.example' },
			{ device: '02:00:00:00:00:33', time: 'Nov 23 08:13:29', type: 'AAAA', client: '192.168.1.33', category: 'Software', domain: 'updates.example' },
			{ device: '02:00:00:00:00:21', time: 'Nov 23 08:13:12', type: 'A', client: '192.168.1.21', category: 'Streaming', domain: 'video.example' },
			{ device: '02:00:00:00:00:44', time: 'Nov 23 08:12:58', type: 'A', client: '192.168.1.44', category: 'Infrastructure', domain: 'time.example' },
			{ device: '02:00:00:00:00:55', time: 'Nov 23 08:12:41', type: 'A', client: '192.168.1.55', category: 'Web', domain: 'example.com' },
			{ device: '02:00:00:00:00:33', time: 'Nov 23 08:12:17', type: 'A', client: '192.168.1.33', category: 'Developer', domain: 'api.example' },
			{ device: '02:00:00:00:00:22', time: 'Nov 23 08:11:59', type: 'A', client: '192.168.1.22', category: 'Web', domain: 'mail.example' },
			{ device: '02:00:00:00:00:99', time: 'Nov 23 08:13:21', type: 'A', client: '192.168.5.42', category: 'Social', domain: 'chat.example' },
			{ device: '02:00:00:00:00:99', time: 'Nov 23 08:12:44', type: 'A', client: '192.168.5.42', category: 'Cloud / CDN', domain: 'maps.example' }
		]
	},
	captive: {
		running: true, enabled: true, port: 8088, acceptedToday: 4, active: 2,
		ssid: 'Example Guest Wi-Fi', title: 'Example Guest Wi-Fi', subtitle: 'Free guest access',
		intro: 'Welcome! Please read the terms below and tap Accept to get online.', session: 240,
		terms: 'Example Guest Wi-Fi — Guest Wi-Fi Terms of Use\n\nThis network is provided as a courtesy for visitors. It is shared, unencrypted and not private: assume that anyone nearby can observe traffic, so do not send passwords, banking details or other sensitive data over it.\n\nBy tapping Accept you agree that you will use this network lawfully and will not attempt to access, damage or disrupt systems that you are not authorised to use.',
		gateIface: 'br-guest', exempt: '02:00:00:00:00:AA, 02:00:00:00:00:BB',
		requests: [
			['2026-11-23 08:12:34', '192.168.1.42', '02:00:00:00:00:42', 'GB', 'direct', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'],
			['2026-11-23 08:13:10', '192.168.1.57', '02:00:00:00:00:57', 'US', 'direct', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0']
		],
		acceptances: [
			['2026-11-23 08:12:45', '192.168.1.42', '02:00:00:00:00:42', 'GB', 'http://example.com/', 'Example Phone'],
			['2026-11-23 08:14:18', '192.168.1.57', '02:00:00:00:00:57', 'US', 'http://example.org/', 'Example Laptop'],
			['2026-11-23 08:15:02', '192.168.5.42', '02:00:00:00:00:99', 'GB', 'http://example.com/', 'Example Phone'],
			['2026-11-23 08:18:44', '192.168.5.57', '02:00:00:00:00:98', 'US', 'https://example.net/', 'Example Tablet']
		]
	},
	fileshares: {
		shares: [
			{ id: 'media', label: 'Media', host: '192.168.1.20', share: 'media', port: 445, user: 'guest', guest: true },
			{ id: 'backups', label: 'Backups', host: '192.168.1.30', share: 'backups', port: 445, user: 'root', guest: false }
		],
		tree: {
			media: {
				'': [{ name: 'films', dir: true }, { name: 'music', dir: true }, { name: 'README.txt', dir: false, size: '2 KB' }],
				'films': [{ name: 'demo-reel.mp4', dir: false, size: '48.2 MB' }, { name: 'holiday', dir: true }],
				'films/holiday': [{ name: 'clip-01.mp4', dir: false, size: '12.4 MB' }],
				'music': [{ name: 'track-01.mp3', dir: false, size: '8.1 MB' }]
			},
			backups: {
				'': [{ name: 'router-config.tar.gz', dir: false, size: '248 KB' }, { name: 'photos', dir: true }],
				'photos': [{ name: 'sample.jpg', dir: false, size: '3.4 MB' }]
			}
		},
		browse: null,
		files: [
			{ name: 'firmware-backup.tar.gz', size: '48.2 MB', modified: '2026-11-23 08:02' },
			{ name: 'guest-list.csv', size: '4 KB', modified: '2026-11-22 19:14' }
		]
	},
	opencode: {
		paired: true, server: 'http://192.0.2.20:4096', local: 'http://192.168.1.1:8091/',
		age: '12s ago', activeSession: 's1',
		sessions: [
			{ id: 's1', title: 'Welcome to the demo', project: 'Demo project', time: 'now', glyph: 'D' },
			{ id: 's2', title: 'Draft release notes', project: 'Demo project', time: '08:12', glyph: 'D' },
			{ id: 's3', title: 'Router notes', project: 'Router notes', time: 'Yesterday', glyph: 'R' },
			{ id: 's4', title: 'Review the README', project: 'Demo project', time: 'Yesterday', glyph: 'D' },
			{ id: 's5', title: 'Plan a weekend project', project: 'Router notes', time: '2d ago', glyph: 'R' }
		],
		messages: {
			s1: [
				{ role: 'assistant', text: 'This is a static demo of the OpenCode client. Nothing here connects to a live server.' },
				{ role: 'user', text: 'What can I click?' },
				{ role: 'assistant', text: 'Try the Session tab: search, select a session, or start a new one. The Status tab shows the pairing state.' }
			]
		}
	},
	siem: {
		enabled: true, target: true, transport: 'syslog', endpoint: 'siem.example.com:6514/TLS',
		sources: ['syslog', 'dns', 'portal'], queue: '12.4 KB · 48 lines',
		delivered: 1204, dropped: 0, errors: 0, lastOk: '2026-11-23 08:12:45',
		host: 'siem.example.com', port: '6514',
		log: [
			'2026-11-23 08:12:45 sent batch=48 bytes=12416 target=siem.example.com:6514 (tls)',
			'2026-11-23 08:11:45 sent batch=52 bytes=13208 target=siem.example.com:6514 (tls)',
			'2026-11-23 08:10:45 sent batch=47 bytes=11984 target=siem.example.com:6514 (tls)'
		]
	},
	leds: {
		enabled: true, blink: true, interval: 5, test: 'real',
		items: [
			{ id: 'internet', name: 'internet:single', desc: 'Internet: on when the uplink is online, blinking when offline.' },
			{ id: 'green', name: 'status:green', desc: 'System: on while the router is running.' },
			{ id: 'red', name: 'status:red', desc: 'Fault: on while the uplink is offline.' },
			{ id: 'wifi', name: 'wifi:green', desc: 'Wi-Fi: on while a radio is up.' },
			{ id: 'signal', name: 'signal:green', desc: 'SIM: on while the SIM is the active uplink.' }
		]
	},
	webview: {
		current: '', vpn: true, handshake: '12s', port: 8090, bind: '0.0.0.0', mark: '0x2',
		failOpen: true
	},
	cloudflare: {
		provider: 'cloudflare.trace', updated: '2m ago',
		records: [
			{ name: 'router.example.com', type: 'A', value: '203.0.113.10', proxied: false },
			{ name: 'vpn.example.com', type: 'A', value: '203.0.113.10', proxied: false }
		],
		tunnels: [
			{ name: 'home-tunnel', uuid: '00000000-0000-4000-8000-000000000001', connected: 4, uptime: '3h 12m', enabled: true },
			{ name: 'router', uuid: '00000000-0000-4000-8000-000000000002', connected: 4, uptime: '3h 12m', enabled: true }
		]
	},
	vpnsplit: {
		up: true, handshake: '12s', entries: 18,
		rules: [
			{ value: 'example.com', kind: 'domain', enabled: true },
			{ value: 'media.example', kind: 'domain', enabled: true },
			{ value: '198.51.100.0/24', kind: 'CIDR', enabled: true },
			{ value: '203.0.113.53', kind: 'IP', enabled: false }
		]
	},
	wifi: [
		{ id: '5g', band: '5 GHz', ssid: 'Example Guest Wi-Fi', channel: 36, clients: 4, enabled: true, security: 'WPA2-PSK / AES', mode: 'Wi-Fi 6 (802.11ax)', guest: true },
		{ id: '24g', band: '2.4 GHz', ssid: 'Example Guest Wi-Fi', channel: 6, clients: 4, enabled: true, security: 'WPA2-PSK / AES', mode: 'Wi-Fi 6 (802.11ax)', guest: true }
	],
	guest: {
		enabled: true, bridge: 'br-guest', subnet: '192.168.5.0/24',
		dhcp: '192.168.5.100 – 192.168.5.249', members: ['ra1', 'rai1']
	},
	networklog: [
		{ time: '2026-11-23 08:20:01', cat: 'Interfaces', scope: 'lan', msg: 'netifd: Interface isp is now up (eth1)' },
		{ time: '2026-11-23 08:19:58', cat: 'WiFi', scope: 'lan', msg: 'wapp: rai0: station 02:00:00:00:00:21 associated (Example Home Wi-Fi)' },
		{ time: '2026-11-23 08:19:40', cat: 'DHCP/DNS', scope: 'lan', msg: 'dnsmasq[1234]: DHCPACK(br-lan) 192.168.1.44 02:00:00:00:00:44 Example Phone' },
		{ time: '2026-11-23 08:18:12', cat: 'DHCP/DNS', scope: 'guest', msg: 'dnsmasq[1234]: DHCPACK(br-guest) 192.168.5.42 02:00:00:00:00:99 Guest phone' },
		{ time: '2026-11-23 08:17:55', cat: 'WiFi', scope: 'guest', msg: 'wapp: rai1: station 02:00:00:00:00:99 associated (Example Guest Wi-Fi)' },
		{ time: '2026-11-23 08:17:31', cat: 'Firewall', scope: 'guest', msg: 'fw3: guest forward 192.168.5.42 -> 203.0.113.10:443 ACCEPT' },
		{ time: '2026-11-23 08:17:04', cat: 'Firewall', scope: 'lan', msg: 'fw3: lan forward 192.168.1.21 -> 203.0.113.10:443 ACCEPT' },
		{ time: '2026-11-23 08:16:44', cat: 'VPN', scope: 'lan', msg: 'vpnsplit: wgvpn handshake 12s, set 18 entries' }
	],
	modem: {
		active: false, registration: 'Registered (roaming)', operator: 'Example Mobile', technology: '5G NSA',
		signal: 78, band: 'n78 · 3.5 GHz', temperature: '42 °C', apn: 'internet.example',
		interface: 'wan', device: 'ccmni3', ip: '198.51.100.23', gateway: '198.51.100.1',
		dns: ['198.51.100.53', '198.51.100.54']
	},
	logs: {
		groups: {
			system: [
				'2026-11-23 08:20:01 daemon.notice netifd: Interface isp is now up',
				'2026-11-23 08:19:58 kern.info kernel: eth1: link up, 1 Gbps full duplex',
				'2026-11-23 08:18:12 daemon.info dnsmasq: started, version 2.80',
				'2026-11-23 08:17:44 daemon.notice procd: service wanfailover started'
			],
			cloudflare: [
				'2026-11-23 08:20:11 daemon.info cloudflared: Registered tunnel connection connIndex=0',
				'2026-11-23 08:20:10 daemon.info cloudflared: Starting tunnel 00000000-0000-4000-8000-000000000001',
				'2026-11-23 08:18:02 daemon.info cloudflare-ddns: router.example.com updated to 203.0.113.10',
				'2026-11-23 08:17:58 daemon.info cloudflare-ddns: no change for vpn.example.com'
			],
			captive: [
				'2026-11-23 08:14:18 daemon.info captive-portal: accepted 192.168.1.57 (02:00:00:00:00:57)',
				'2026-11-23 08:12:45 daemon.info captive-portal: accepted 192.168.1.42 (02:00:00:00:00:42)',
				'2026-11-23 08:12:34 daemon.info captive-portal: splash request 192.168.1.42',
				'2026-11-23 08:12:30 daemon.info captive-portal: local portal running on 8088'
			],
			parental: [
				'2026-11-23 08:20:24 user.notice parental: Kids tablet is now allowed',
				'2026-11-23 08:06:17 user.notice parental: Kids tablet is now allowed',
				'2026-11-23 07:58:02 user.notice parental: living-room-tv blocked',
				'2026-11-23 07:57:58 user.notice parental: applied 2 rules'
			],
			vpn: [
				'2026-11-23 08:20:02 user.notice vpnsplit: wgvpn handshake 12s, set 18 entries',
				'2026-11-23 08:14:44 user.notice vpnsplit: table 100 route via wgvpn',
				'2026-11-23 08:12:01 user.notice wanfailover: SIM parked, ISP carrying traffic',
				'2026-11-23 08:11:40 user.notice wghome: handshake from 10.0.0.1'
			],
			firewall: [
				'2026-11-23 08:20:05 kern.warn kernel: PARENTAL drop IN=br-lan OUT=eth1 SRC=192.168.1.21',
				'2026-11-23 08:19:12 kern.info kernel: PORTAL_FWD accept 192.168.1.42',
				'2026-11-23 08:18:02 kern.info kernel: fw3 reload complete',
				'2026-11-23 08:17:58 kern.info kernel: vpnset matched 198.51.100.0/24'
			],
			siem: [
				'2026-11-23 08:12:45 user.notice siem: sent batch=48 bytes=12416 target=siem.example.com:6514 (tls)',
				'2026-11-23 08:11:45 user.notice siem: sent batch=52 bytes=13208 target=siem.example.com:6514 (tls)',
				'2026-11-23 08:10:45 user.notice siem: sent batch=47 bytes=11984 target=siem.example.com:6514 (tls)',
				'2026-11-23 08:09:01 user.notice siem: queue 2.4 KB, 0 dropped'
			],
			dhcpdns: [
				'2026-11-23 08:19:40 daemon.info dnsmasq[1234]: DHCPACK(br-lan) 192.168.1.44 02:00:00:00:00:44 phone',
				'2026-11-23 08:18:12 daemon.info dnsmasq[1234]: DHCPACK(br-guest) 192.168.5.42 02:00:00:00:00:99 guest-phone',
				'2026-11-23 08:17:05 daemon.info dnsmasq[1234]: query[A] example.com from 192.168.1.21',
				'2026-11-23 08:16:44 daemon.info dnsmasq[1234]: forwarded example.com to 203.0.113.53',
				'2026-11-23 08:15:02 daemon.info odhcpd: DHCPV6 SOLICIT from 02:00:00:00:00:44 on br-lan'
			],
			sshweb: [
				'2026-11-23 08:20:02 authpriv.info dropbear[2210]: password auth succeeded for root from 192.168.1.33:54122',
				'2026-11-23 08:19:11 daemon.info uhttpd[2210]: 192.168.1.33 GET /cgi-bin/luci/admin/status/overview 200',
				'2026-11-23 08:18:44 daemon.info uhttpd[31316]: 192.168.5.42 GET /cgi-bin/splash 200',
				'2026-11-23 08:17:31 authpriv.notice dropbear[2210]: exit before auth from 192.168.1.66:50218',
				'2026-11-23 08:16:01 daemon.info uhttpd[2210]: 192.168.1.33 POST /cgi-bin/luci/admin/network/parental/toggle 302'
			]
		}
	},
	realtimeTabs: {
		load: {
			note: 'load average · last 3 minutes',
			meters: [['1 min', '0.68', 23, ''], ['5 min', '0.62', 21, ''], ['15 min', '0.58', 19, ''], ['Processes', '112 running', 34, '']]
		},
		traffic: {
			note: 'interface counters',
			meters: [['eth1 RX', '2.4 Mbit/s', 12, ''], ['eth1 TX', '480 kbit/s', 5, ''], ['br-lan RX', '18.2 MB/s', 61, ''], ['br-lan TX', '4.1 MB/s', 14, ''], ['br-guest RX', '1.1 MB/s', 8, '']]
		},
		wireless: {
			note: 'associated clients and rates',
			table: { headers: ['Radio', 'SSID', 'Clients', 'Rate', 'State'], rows: [
				['rai0 · 5 GHz', 'Example Home Wi-Fi', '4', '1201 Mbit/s', 'up'],
				['ra0 · 2.4 GHz', 'Example Home Wi-Fi', '2', '574 Mbit/s', 'up'],
				['rai1 · 5 GHz', 'Example Guest Wi-Fi', '1', '866 Mbit/s', 'up'],
				['ra1 · 2.4 GHz', 'Example Guest Wi-Fi', '1', '144 Mbit/s', 'up']
			] }
		},
		connections: {
			note: 'conntrack sample',
			table: { headers: ['Source', 'Destination', 'Protocol', 'State', 'Timeout'], rows: [
				['192.168.1.21:53122', '203.0.113.10:443', 'tcp', 'ESTABLISHED', '2h 11m'],
				['192.168.5.42:50880', '203.0.113.53:53', 'udp', 'REPLY', '28s'],
				['10.0.0.4:51820', '192.0.2.20:51820', 'udp', 'ESTABLISHED', '4m'],
				['192.168.1.33:54122', '192.168.1.1:22', 'tcp', 'ESTABLISHED', '18m']
			] }
		}
	},
	vendorServices: [
		{ id: 'svc-openclash', label: 'OpenClash', title: 'OpenClash', desc: 'Transparent proxy client shipped with the vendor firmware.', cards: [
			{ title: 'Status', kv: [['Service', 'disabled'], ['Mode', 'rule'], ['Config', 'not loaded'], ['Dashboard', 'not running']] },
			{ title: 'Profiles', table: { headers: ['Profile', 'Source', 'Updated', 'State'], rows: [['default', 'local', '—', 'disabled']] } }
		] },
		{ id: 'svc-passwall', label: 'Pass Wall', title: 'Pass Wall', desc: 'Proxy policy and node selection.', cards: [
			{ title: 'Status', kv: [['Service', 'disabled'], ['TCP node', 'none'], ['UDP node', 'none'], ['DNS', 'dnsmasq']] },
			{ title: 'Nodes', table: { headers: ['Name', 'Type', 'Address', 'State'], rows: [['example-node', 'socks', '192.0.2.30:1080', 'disabled']] } }
		] },
		{ id: 'svc-passwall2', label: 'PassWall 2', title: 'PassWall 2', desc: 'Second-generation proxy policy page.', cards: [
			{ title: 'Status', kv: [['Service', 'disabled'], ['Primary node', 'none'], ['Fallback', 'none'], ['Socks port', '—']] },
			{ title: 'Rules', table: { headers: ['Rule', 'Target', 'Policy', 'State'], rows: [['lan', '10.0.0.0/8', 'direct', 'disabled']] } }
		] },
		{ id: 'svc-smartdns', label: 'SmartDNS', title: 'SmartDNS', desc: 'Local DNS forwarder with upstream groups.', cards: [
			{ title: 'Status', kv: [['Service', 'disabled'], ['Listen', '127.0.0.1:6053'], ['Cache', 'disabled'], ['Upstreams', '0']] },
			{ title: 'Upstream servers', table: { headers: ['Name', 'Address', 'Type', 'State'], rows: [['example-dns', '203.0.113.53', 'udp', 'disabled']] } }
		] },
		{ id: 'svc-nextdns', label: 'NextDNS', title: 'NextDNS', desc: 'Cloud DNS profile connector.', cards: [
			{ title: 'Status', kv: [['Service', 'disabled'], ['Profile', 'not configured'], ['Endpoint', 'dns.nextdns.io'], ['Cache', 'disabled']] }
		] },
		{ id: 'svc-tailscale', label: 'Tailscale', title: 'Tailscale', desc: 'Mesh VPN connector.', cards: [
			{ title: 'Status', kv: [['Service', 'disabled'], ['Tailnet', 'example.ts.net'], ['Auth key', 'not set'], ['Exit node', 'no']] },
			{ title: 'Peers', table: { headers: ['Name', 'Address', 'OS', 'State'], rows: [['example-laptop', '100.64.0.2', 'Linux', 'offline']] } }
		] },
		{ id: 'svc-upnp', label: 'UPnP', title: 'UPnP', desc: 'Automatic port mapping service.', cards: [
			{ title: 'Status', kv: [['Service', 'disabled'], ['Interface', 'br-lan'], ['Secure mode', 'enabled'], ['Leases', '0']] },
			{ title: 'Active forwards', table: { headers: ['Client', 'External', 'Internal', 'Protocol'], rows: [['—', '—', '—', '—']] } }
		] },
		{ id: 'svc-ddns', label: 'Dynamic DNS', title: 'Dynamic DNS', desc: 'Legacy dynamic DNS client. The Cloudflare page is the active DDNS integration.', cards: [
			{ title: 'Status', kv: [['Service', 'disabled'], ['Provider', 'none'], ['Hostname', '—'], ['Last update', '—']] },
			{ title: 'Note', kv: [['Active DDNS', 'Services → Cloudflare']] }
		] },
		{ id: 'svc-shadowsocksr', label: 'ShadowSocksR Plus+', title: 'ShadowSocksR Plus+', desc: 'Proxy client with server nodes and access control.', cards: [
			{ title: 'Status', kv: [['Service', 'disabled'], ['Server', 'none'], ['Mode', 'global'], ['UDP relay', 'disabled']] },
			{ title: 'Servers', table: { headers: ['Name', 'Address', 'Cipher', 'State'], rows: [['example-ssr', '192.0.2.40:8388', 'aes-256-cfb', 'disabled']] } }
		] },
		{ id: 'svc-uhttpd', label: 'uHTTPd', title: 'uHTTPd', desc: 'The router’s web server. LuCI and the captive portal run as separate instances.', cards: [
			{ title: 'Status', kv: [['Service', 'running'], ['LuCI', ':80'], ['HTTPS gate', ':443 via ocgate'], ['Portal', ':8088'], ['Document root', '/www']] },
			{ title: 'Listeners', table: { headers: ['Port', 'Instance', 'Root', 'Purpose'], rows: [['80', 'uhttpd', '/www', 'LuCI'], ['443', 'ocgate', '—', 'TLS front door'], ['8088', 'uhttpd-portal', '/www/portal', 'guest splash']] } }
		] }
	]
};
