/* AW1000 Console — shell behaviour, overview telemetry, login helpers. */
(function () {
	'use strict';

	document.documentElement.classList.add('has-js');

	var doc = document;
	var LS_NAV = 'aw1000.nav';
	var LS_RAIL = 'aw1000.rail';
	var OVERVIEW = 'admin-status-overview';

	function $(sel, root) { return (root || doc).querySelector(sel); }
	function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
	function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

	function store(key, value) {
		try {
			if (value === null) localStorage.removeItem(key);
			else localStorage.setItem(key, value);
		} catch (e) {}
	}
	function load(key) {
		try { return localStorage.getItem(key); } catch (e) { return null; }
	}

	/* ---------------------------------------------------------------- shell */

	var app = $('#app');
	var rail = $('#rail');
	var scrim = $('#scrim');
	var navToggle = $('#nav-toggle');
	var railToggle = $('#rail-toggle');

	function isMobile() {
		return window.matchMedia('(max-width: 1080px)').matches;
	}

	function setDrawer(open) {
		if (!app) return;
		app.classList.toggle('nav-open', open);
		if (scrim) scrim.hidden = !open;
		doc.body.classList.toggle('nav-locked', open);
		if (navToggle) navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		/* A closed off-canvas rail must not stay in the tab order. */
		if (rail) {
			var hidden = isMobile() && !open;
			if ('inert' in rail) rail.inert = hidden;
			rail.setAttribute('aria-hidden', hidden ? 'true' : 'false');

			/* Move focus into the drawer on open, back to the toggle on close.
			   Skip on desktop so resizing never steals focus. */
			if (hidden && rail.contains(doc.activeElement) && navToggle) {
				navToggle.focus();
			}
			else if (open && isMobile()) {
				var first = rail.querySelector('a, button');
				if (first) first.focus();
			}
		}
	}

	on(navToggle, 'click', function () { setDrawer(!app.classList.contains('nav-open')); });
	on(scrim, 'click', function () { setDrawer(false); });

	on(doc, 'keydown', function (ev) {
		if (ev.key === 'Escape') setDrawer(false);
	});

	on(railToggle, 'click', function () {
		var collapsed = doc.documentElement.classList.toggle('rail-collapsed');
		store(LS_RAIL, collapsed ? 'collapsed' : 'expanded');
		railToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		railToggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
		railToggle.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
	});

	if (load(LS_RAIL) === 'collapsed' && railToggle) {
		railToggle.setAttribute('aria-expanded', 'false');
		railToggle.setAttribute('aria-label', 'Expand sidebar');
		railToggle.setAttribute('title', 'Expand sidebar');
	}

	function saveOpenGroups() {
		var state = {};
		$$('#topmenu .nav-group.is-open').forEach(function (li) {
			state[li.getAttribute('data-section')] = true;
		});
		store(LS_NAV, JSON.stringify(state));
	}

	function openOnly(group) {
		$$('#topmenu .nav-group.is-open').forEach(function (li) {
			if (li === group) return;
			li.classList.remove('is-open');
			var h = li.querySelector('.nav-head');
			if (h) h.setAttribute('aria-expanded', 'false');
		});
	}

	on($('#topmenu'), 'click', function (ev) {
		var head = ev.target.closest ? ev.target.closest('.nav-head') : null;
		var group = head ? head.parentNode : null;
		if (!group || !group.classList.contains('nav-group')) return;

		/* Leaf links navigate normally. */
		if (head.tagName === 'A') {
			if (isMobile()) setDrawer(false);
			return;
		}

		/* Group headers toggle their children. */
		ev.preventDefault();

		if (!isMobile() && doc.documentElement.classList.contains('rail-collapsed')) {
			doc.documentElement.classList.remove('rail-collapsed');
			store(LS_RAIL, 'expanded');
			if (railToggle) railToggle.setAttribute('aria-expanded', 'true');
			openOnly(group);
			group.classList.add('is-open');
			head.setAttribute('aria-expanded', 'true');
			saveOpenGroups();
			return;
		}

		if (!group.classList.contains('is-open'))
			openOnly(group);

		var open = group.classList.toggle('is-open');
		head.setAttribute('aria-expanded', open ? 'true' : 'false');
		saveOpenGroups();
	});

	on($('#topmenu'), 'click', function (ev) {
		var link = ev.target.closest ? ev.target.closest('.nav-sub a') : null;
		if (link && isMobile()) setDrawer(false);
	});

	var mq = window.matchMedia('(max-width: 1080px)');
	function onViewport() {
		if (!mq.matches) setDrawer(false);
	}
	if (mq.addEventListener) mq.addEventListener('change', onViewport);
	else if (mq.addListener) mq.addListener(onViewport);

	/* ------------------------------------------------------------- telemetry */

	var ENDPOINT = (window.L && L.url) ? L.url('admin/status/vitals') : '/cgi-bin/luci/admin/status/vitals';
	var chip = $('#wan-chip');
	var chipLabel = chip && $('.wan-label', chip);
	var chipIP = chip && $('.wan-ip', chip);
	var failures = 0;

	function fmtBits(v) {
		v = +v || 0;
		if (v >= 1000000) return (v / 1000000).toFixed(v >= 10000000 ? 0 : 1) + ' Mbit/s';
		if (v >= 1000) return (v / 1000).toFixed(0) + ' kbit/s';
		return Math.round(v) + ' bit/s';
	}

	function fmtBytes(b) {
		b = +b || 0;
		if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
		if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
		if (b >= 1024) return (b / 1024).toFixed(1) + ' kB';
		return Math.round(b) + ' B';
	}

	function fmtDuration(sec) {
		sec = Math.max(0, Math.round(+sec || 0));
		var d = Math.floor(sec / 86400),
			h = Math.floor((sec % 86400) / 3600),
			m = Math.floor((sec % 3600) / 60);
		if (d) return d + 'd ' + h + 'h';
		if (h) return h + 'h ' + m + 'm';
		return m + 'm ' + (sec % 60) + 's';
	}

	function asArray(v) {
		if (Array.isArray(v)) return v;
		if (v && typeof v === 'object') return Object.keys(v).map(function (k) { return v[k]; });
		return [];
	}

	function setChip(data) {
		if (!chip) return;
		var wan = data && data.wan || {};
		var up = !!wan.up;
		chip.setAttribute('data-state', up ? 'up' : 'down');
		if (chipLabel) chipLabel.textContent = up ? 'Online' : 'Offline';
		if (chipIP) chipIP.textContent = wan.ipv4 || '';
		chip.setAttribute('title', up
			? 'WAN online (' + (wan.uplink === 'wired' ? 'wired' : '5G') + ') · ' + (wan.ipv4 || 'no address') + ' · ' + (wan.proto || '').toUpperCase()
			: 'WAN offline · no address');
	}

	function fetchVitals() {
		return fetch(ENDPOINT, { credentials: 'same-origin', cache: 'no-store' })
			.then(function (r) {
				if (!r.ok) throw new Error('HTTP ' + r.status);
				return r.json();
			})
			.then(function (data) {
				failures = 0;
				setChip(data);
				doc.dispatchEvent(new CustomEvent('console:vitals', { detail: data }));
				return data;
			})
			.catch(function (err) {
				failures++;
				if (failures >= 2 && chip) {
					chip.setAttribute('data-state', 'unknown');
					if (chipLabel) chipLabel.textContent = 'Status unknown';
				}
				doc.dispatchEvent(new CustomEvent('console:vitals-error', { detail: err }));
			});
	}

	/* ------------------------------------------------------------- overview */

	var MAX_POINTS = 36;
	var rxHist = [], txHist = [];
	var lastSample = null;
	var hero = null;
	var uplinks = null;
	var thermal = null;
	var timer = null;

	function heroMarkup() {
		return '' +
		'<div class="hero-main">' +
			'<div class="hero-top">' +
				'<span class="hero-eyebrow"><span class="dot"></span>Internet<span class="hero-via" data-k="via"></span><span class="hero-proto"></span></span>' +
				'<span class="hero-live"><span class="pulse"></span>live</span>' +
			'</div>' +
			'<div class="hero-ip mono" data-k="ip">—</div>' +
			'<div class="hero-meta">' +
				'<span data-k="gw">Gateway —</span>' +
				'<span data-k="dns">DNS —</span>' +
				'<span data-k="uptime">Connected —</span>' +
			'</div>' +
			'<div class="hero-chart">' +
				'<div class="chart-head"><span>WAN throughput</span><span>last 3 min</span></div>' +
				'<div class="chart-plot">' +
				'<svg viewBox="0 0 600 96" preserveAspectRatio="none" aria-hidden="true">' +
					'<g class="chart-grid"><path d="M0 24h600M0 48h600M0 72h600"/></g>' +
					'<path class="chart-area chart-area-tx" d=""/>' +
					'<path class="chart-area chart-area-rx" d=""/>' +
					'<path class="chart-line chart-line-tx" d=""/>' +
					'<path class="chart-line chart-line-rx" d=""/>' +
				'</svg>' +
				'<div class="chart-empty">Measuring throughput…</div>' +
				'</div>' +
				'<div class="chart-legend">' +
					'<span class="lg-rx"><i></i>RX <b data-k="rx">—</b></span>' +
					'<span class="lg-tx"><i></i>TX <b data-k="tx">—</b></span>' +
					'<span class="chart-total mono" data-k="totals">—</span>' +
				'</div>' +
			'</div>' +
		'</div>' +
		'<div class="hero-side">' +
			'<a class="hstat" data-href="admin/network/parental/activity">' +
				'<span class="hstat-label">LAN devices</span>' +
				'<span class="hstat-value mono" data-k="clients">—</span>' +
				'<span class="hstat-foot" data-k="clients-foot">seen on br-lan</span>' +
			'</a>' +
			'<a class="hstat" data-href="admin/mtk/wifi">' +
				'<span class="hstat-label">Wi-Fi</span>' +
				'<span class="hstat-value hstat-value-sm" data-k="wifi">—</span>' +
				'<span class="hstat-foot" data-k="wifi-foot">radios</span>' +
			'</a>' +
			'<a class="hstat" data-href="admin/network/vpnsplit">' +
				'<span class="hstat-label">VPN</span>' +
				'<span class="hstat-value mono" data-k="vpn">—</span>' +
				'<span class="hstat-foot" data-k="vpn-foot">tunnels</span>' +
			'</a>' +
			'<a class="hstat" data-href="admin/status/realtime">' +
				'<span class="hstat-label">System</span>' +
				'<span class="hstat-value mono" data-k="cpu">—</span>' +
				'<span class="hstat-foot" data-k="cpu-foot">mem — · load —</span>' +
			'</a>' +
		'</div>';
	}

	/* ----------------------------------------------------------- speedtest */

	var SPEED_ENDPOINT = (window.L && L.url) ? L.url('admin/status/netspeed') : '/cgi-bin/luci/admin/status/netspeed';
	var speed = null;
	var speedTimer = null;
	var speedPending = null;

	function speedMarkup() {
		return '' +
		'<div class="speed-head">' +
			'<span class="speed-title">Speed tests</span>' +
			'<span class="speed-note" data-k="speed-note">speedtest.net</span>' +
		'</div>' +
		'<div class="speed-rows" data-k="speed-rows"></div>' +
		'<div class="speed-foot" data-k="speed-foot">' +
			'Router-side measurement — traffic forwarded to clients uses the hardware ' +
			'fast path and can be several times faster. Read it as a floor and as an ' +
			'ISP-vs-SIM comparison, not as the line\'s capacity.' +
		'</div>';
	}

	function fmtMbps(bps) {
		bps = +bps || 0;
		if (!bps) return '—';
		return (bps / 1000000).toFixed(bps >= 100000000 ? 0 : 1);
	}

	function fmtAgo(ts) {
		var s = Math.max(0, Math.round(Date.now() / 1000) - (ts || 0));
		if (s < 60) return 'just now';
		if (s < 3600) return Math.round(s / 60) + 'm ago';
		if (s < 86400) return Math.round(s / 3600) + 'h ago';
		return Math.round(s / 86400) + 'd ago';
	}

	function speedEl(tag, cls, text) {
		var n = doc.createElement(tag);
		if (cls) n.className = cls;
		if (text != null) n.textContent = text;
		return n;
	}

	function speedFig(value, unit) {
		var wrap = speedEl('span', 'speed-fig');
		wrap.appendChild(speedEl('b', 'mono', value));
		wrap.appendChild(speedEl('i', null, unit));
		return wrap;
	}

	function speedRow(link, res, running) {
		var row = speedEl('div', 'speed-row');
		row.setAttribute('data-link', link);
		row.setAttribute('data-state', running ? 'running' : (res ? 'ok' : 'none'));

		/* Column order must match the CSS grid: link, 3 figures, meta, age, button. */
		row.appendChild(speedEl('span', 'speed-link', link.toUpperCase()));
		if (res) {
			row.appendChild(speedFig(fmtMbps(res.down), 'Mbps ↓'));
			row.appendChild(speedFig(fmtMbps(res.up), 'Mbps ↑'));
			row.appendChild(speedFig(res.ping != null ? String(res.ping) : '—', 'ms'));
		} else {
			for (var i = 0; i < 3; i++) row.appendChild(speedEl('span', 'speed-fig speed-none', '—'));
		}

		var meta = speedEl('span', 'speed-meta',
			res ? [res.server, res.isp, res.mb ? '~' + res.mb + ' MB' : null].filter(Boolean).join(' · ')
			    : 'no test recorded yet');
		if (res) {
			meta.title = (res.ip || '') + ' via ' + (res.server || '')
				+ (res.engine ? ' · ' + res.engine : '')
				+ (res.up ? '' : ' · download only')
				+ ' · ' + new Date(res.ts * 1000).toLocaleString();
		}
		row.appendChild(meta);
		row.appendChild(speedEl('span', 'speed-age', res ? fmtAgo(res.ts) : ''));

		var btn = speedEl('button', 'speed-run', running ? 'Testing…' : 'Run');
		btn.type = 'button';
		btn.disabled = !!running;
		btn.addEventListener('click', function () { runSpeed(link); });
		row.appendChild(btn);
		return row;
	}

	function renderSpeed(data) {
		if (!speed || !data) return;
		var host = $('[data-k="speed-rows"]', speed);
		if (!host) return;

		var note = $('[data-k="speed-note"]', speed);
		if (note) {
			var engine = (data.isp && data.isp.engine) || (data.sim && data.sim.engine) || '';
			note.textContent = data.running
				? 'testing — a few seconds, uses real data'
				: (engine ? engine + ' · runs on failover' : 'runs on failover');
			note.title = engine ? 'Engine: ' + engine : '';
		}

		host.innerHTML = '';
		host.appendChild(speedRow('isp', data.isp, !!data.running && speedPending === 'isp'));
		host.appendChild(speedRow('sim', data.sim, !!data.running && speedPending === 'sim'));

		if (data.running) scheduleSpeedPoll(3000);
	}

	function fetchSpeed() {
		return fetch(SPEED_ENDPOINT, { credentials: 'same-origin', cache: 'no-store' })
			.then(function (r) { return r.ok ? r.json() : null; })
			.then(function (d) { if (d) renderSpeed(d); return d; })
			.catch(function () {});
	}

	function scheduleSpeedPoll(ms) {
		if (speedTimer) clearTimeout(speedTimer);
		speedTimer = setTimeout(fetchSpeed, ms);
	}

	function runSpeed(link) {
		speedPending = link;
		var body = 'action=run&link=' + encodeURIComponent(link)
			+ '&token=' + encodeURIComponent((window.L && L.env && L.env.token) || '');
		fetch(SPEED_ENDPOINT, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body
		}).then(fetchSpeed).catch(function () { speedPending = null; });
	}

	/* ------------------------------------------------------------- thermals */

	var THERMAL_GROUPS = [
		{ key: 'cpu', label: 'CPU cluster', test: /^cpu_little/ },
		{ key: 'gpu', label: 'GPU', test: /^gpu/ },
		{ key: 'pmic', label: 'PMIC rails', test: /^pmic/ },
		{ key: 'modem', label: 'Modem / RF', test: /^(md_|nrpa|ltepa|rf_ntc)/ },
		{ key: 'dram', label: 'DRAM', test: /dram/ }
	];

	function tempBand(c) {
		if (c >= 85) return 'critical';
		if (c >= 70) return 'hot';
		if (c >= 55) return 'warm';
		return 'cool';
	}

	function tempBandLabel(c) {
		return { critical: 'Critical', hot: 'Hot', warm: 'Warm', cool: 'Cool' }[tempBand(c)];
	}

	/* 25-95 C mapped onto the gauge; clamped so the pin stays inside it. */
	function tempPos(c) {
		var p = ((c - 25) / 70) * 100;
		return Math.max(1.5, Math.min(100, p));
	}

	function shortSensor(n) {
		return n
			.replace(/^cpu_little(\d)$/, 'CPU$1')
			.replace(/^soc_max$/, 'soc')
			.replace(/^md_5g$/, '5G').replace(/^md_4g$/, '4G').replace(/^md_3g$/, '3G')
			.replace(/^md_rf$/, 'RF').replace(/_ntc$/, '').replace(/_/g, ' ');
	}

	function thermalMarkup() {
		return '' +
		'<div class="thermal-head">' +
			'<span class="thermal-title">Thermals</span>' +
			'<span class="thermal-note" data-k="thermal-note">—</span>' +
		'</div>' +
		'<div class="thermal-body">' +
			'<div class="thermal-main">' +
				'<div class="thermal-now">' +
					'<span class="thermal-value mono" data-k="thermal-max">—</span>' +
					'<span class="thermal-unit">°C</span>' +
				'</div>' +
				'<div class="thermal-band" data-k="thermal-band">—</div>' +
				'<div class="thermal-gauge"><span class="thermal-gauge-pin" data-k="thermal-pin"></span></div>' +
				'<div class="thermal-scale"><span>25</span><span>55</span><span>75</span><span>95</span></div>' +
				'<div class="thermal-spark"><svg viewBox="0 0 232 34" preserveAspectRatio="none" aria-hidden="true">' +
					'<path class="thermal-spark-area" d=""/><path class="thermal-spark-line" d=""/></svg></div>' +
				'<div class="thermal-sub" data-k="thermal-sub">SoC hotspot</div>' +
			'</div>' +
			'<div class="thermal-groups" data-k="thermal-groups"></div>' +
		'</div>' +
		'<div class="thermal-chips" data-k="thermal-chips"></div>';
	}

	/* SoC trend. Auto-scaled to the window's own range: on an absolute 25-95
	   scale six hours of 43-46 C would be a flat line. */
	function drawSpark(hist) {
		var svg = $('.thermal-spark svg', thermal);
		if (!svg || !hist.length) return;
		var n = hist.length;
		if (n < 2) return;

		var lo = Math.min.apply(Math, hist);
		var hi = Math.max.apply(Math, hist);
		if (hi - lo < 5) { var mid = (hi + lo) / 2; lo = mid - 3; hi = mid + 3; }

		var W = 232, H = 34, pad = 3, d = '';
		for (var i = 0; i < n; i++) {
			var x = (i * W) / (n - 1);
			var y = H - pad - ((hist[i] - lo) / (hi - lo)) * (H - pad * 2);
			d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
		}
		$('.thermal-spark-line', svg).setAttribute('d', d);
		$('.thermal-spark-area', svg).setAttribute('d', d + 'L' + W + ' ' + H + 'L0 ' + H + 'Z');

		var mins = Math.round((n - 1) * 5);
		svg.parentNode.setAttribute('title',
			'SoC max, last ' + (mins >= 60 ? Math.round(mins / 60) + 'h' : mins + 'm')
			+ ' · ' + (lo / 10).toFixed(1) + '–' + (hi / 10).toFixed(1) + ' °C (auto-scaled)');
	}

	function renderThermals(data) {
		var t = data && data.thermal;
		if (!thermal || !t) return;
		var list = asArray(t.sensors);
		if (!list.length) { thermal.classList.add('is-empty'); return; }

		var max = (+t.max || 0) / 10; /* tenths from the router */
		thermal.setAttribute('data-band', tempBand(max));

		var el = $('[data-k="thermal-max"]', thermal);
		if (el) el.textContent = max.toFixed(1);
		el = $('[data-k="thermal-band"]', thermal);
		if (el) el.textContent = tempBandLabel(max);
		el = $('[data-k="thermal-note"]', thermal);
		if (el) {
			el.textContent = list.length + ' sensors · '
				+ (t.cooling ? t.cooling + ' throttling' : 'no throttling');
		}
		el = $('[data-k="thermal-pin"]', thermal);
		if (el) el.style.left = tempPos(max).toFixed(1) + '%';

		drawSpark(asArray(t.hist));

		el = $('[data-k="thermal-sub"]', thermal);
		if (el) {
			var peak = (+t.peak || 0) / 10;
			if (peak > 0) {
				var at = t.peak_at ? new Date(t.peak_at * 1000) : null;
				el.textContent = 'peak ' + peak.toFixed(1) + '°'
					+ (at ? ' at ' + at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
			} else {
				el.textContent = 'SoC hotspot';
			}
		}

		var groups = $('[data-k="thermal-groups"]', thermal);
		if (groups) {
			var html = '';
			THERMAL_GROUPS.forEach(function (g) {
				var vals = list.filter(function (s) { return g.test.test(s.name); })
					.map(function (s) { return +s.c / 10; });
				if (!vals.length) return;
				var hot = Math.max.apply(Math, vals);
				html += '<div class="thermal-row" data-band="' + tempBand(hot) + '">' +
					'<span class="thermal-row-label">' + g.label + '</span>' +
					'<span class="thermal-row-bar"><i style="width:' + tempPos(hot).toFixed(1) + '%"></i></span>' +
					'<span class="thermal-row-val mono">' + hot.toFixed(1) + '°</span>' +
					'</div>';
			});
			groups.innerHTML = html;
		}

		var chips = $('[data-k="thermal-chips"]', thermal);
		if (chips) {
			chips.innerHTML = list.map(function (s) {
				var c = (+s.c) / 10;
				return '<span class="thermal-chip" data-band="' + tempBand(c) + '" title="' + s.name + '">' +
					shortSensor(s.name) + ' <b>' + c.toFixed(1) + '</b></span>';
			}).join('');
		}
	}

	function uplinkMarkup() {		return '' +
		'<div class="uplinks-head">' +
			'<span class="uplinks-title">WAN interfaces</span>' +
			'<span class="uplinks-note" data-k="uplinks-note">—</span>' +
		'</div>' +
		'<div class="uplinks-list" data-k="uplinks-list"></div>';
	}

	function decorate(view) {
		doc.body.classList.add('page-overview');
		view.classList.add('dash-grid');

		var h2 = $('#maincontent > h2');
		if (h2 && h2.textContent.trim() === 'Status') h2.textContent = 'Overview';

		var map = { System: 'card-system', Memory: 'card-memory', Network: 'card-network', 'Active DHCP Leases': 'card-leases' };
		$$('#view > .cbi-section', view).forEach(function (s) {
			var h = s.querySelector('h3');
			var title = h ? h.textContent.trim() : '';
			if (map[title]) s.classList.add(map[title]);

			/* Vendor placeholders with no data add noise, not information. */
			var body = s.querySelector('div');
			if ((title === 'DSL' || title === 'Wireless') && body && !body.textContent.trim() && !body.querySelector('*'))
				s.classList.add('is-empty');
		});

		/* The UPnP include renders an empty table when nothing is redirected. */
		setTimeout(function () {
			$$('#maincontent .includes > .cbi-section').forEach(function (s) {
				if (/there are no active redirects/i.test(s.textContent || ''))
					s.classList.add('is-empty');
			});
		}, 700);

		if ($('#console-hero', view)) return;

		hero = doc.createElement('section');
		hero.id = 'console-hero';
		hero.className = 'hero';
		hero.setAttribute('data-state', 'loading');
		hero.innerHTML = heroMarkup();
		view.insertBefore(hero, view.firstChild);

		uplinks = doc.createElement('section');
		uplinks.id = 'console-uplinks';
		uplinks.className = 'uplinks';
		uplinks.innerHTML = uplinkMarkup();
		if (hero.nextSibling) view.insertBefore(uplinks, hero.nextSibling);
		else view.appendChild(uplinks);

		thermal = doc.createElement('section');
		thermal.id = 'console-thermals';
		thermal.className = 'thermal';
		thermal.innerHTML = thermalMarkup();
		if (uplinks.nextSibling) view.insertBefore(thermal, uplinks.nextSibling);
		else view.appendChild(thermal);

		speed = doc.createElement('section');
		speed.id = 'console-speed';
		speed.className = 'speed';
		speed.innerHTML = speedMarkup();
		if (thermal.nextSibling) view.insertBefore(speed, thermal.nextSibling);
		else view.appendChild(speed);

		$$('.hstat', hero).forEach(function (a) {
			var u = a.getAttribute('data-href');
			if (u) a.setAttribute('href', (window.L && L.url) ? L.url(u) : '/cgi-bin/luci/' + u);
		});

		var tpl = $('.hero-ip', hero);
		if (tpl) tpl.setAttribute('title', 'WAN address');
	}

	function heroSet(key, value) {
		if (!hero) return;
		var el = $('[data-k="' + key + '"]', hero);
		if (el) el.textContent = value;
	}

	function heroState(state) {
		if (hero) hero.setAttribute('data-state', state);
	}

	function currentRate(cur, prev, dt) {
		if (!prev || !(dt > 0)) return 0;
		var delta = cur - prev;
		if (delta < 0) delta = 0; /* counter reset after reboot */
		return (delta * 8) / dt;
	}

	function sample(data) {
		var wan = data.wan || {};
		var now = Date.now();
		var rxRate = 0, txRate = 0;

		if (lastSample && wan.rx_bytes != null && wan.tx_bytes != null) {
			var dt = (now - lastSample.t) / 1000;
			if (dt > 0 && dt < 120) {
				rxRate = currentRate(+wan.rx_bytes, lastSample.rx, dt);
				txRate = currentRate(+wan.tx_bytes, lastSample.tx, dt);
			}
		}
		if (wan.rx_bytes != null && wan.tx_bytes != null) {
			lastSample = { t: now, rx: +wan.rx_bytes, tx: +wan.tx_bytes };
		}

		rxHist.push(rxRate);
		txHist.push(txRate);
		if (rxHist.length > MAX_POINTS) rxHist.shift();
		if (txHist.length > MAX_POINTS) txHist.shift();

		drawChart();
		heroSet('rx', lastSample ? fmtBits(rxRate) : '—');
		heroSet('tx', lastSample ? fmtBits(txRate) : '—');
	}

	function drawChart() {
		if (!hero) return;
		var svg = $('.hero-chart svg', hero);
		if (!svg) return;
		var max = 250000;
		rxHist.concat(txHist).forEach(function (v) { if (v > max) max = v; });
		max *= 1.18;

		function path(hist, area) {
			var n = hist.length;
			if (!n) return '';
			var step = 600 / (MAX_POINTS - 1);
			var startX = 600 - (n - 1) * step;
			var d = '';
			for (var i = 0; i < n; i++) {
				var x = startX + i * step;
				var y = 88 - (hist[i] / max) * 76;
				d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
			}
			if (area) d += 'L' + (startX + (n - 1) * step).toFixed(2) + ' 96L' + startX.toFixed(2) + ' 96Z';
			return d;
		}

		$('.chart-line-rx', svg).setAttribute('d', path(rxHist, false));
		$('.chart-line-tx', svg).setAttribute('d', path(txHist, false));
		$('.chart-area-rx', svg).setAttribute('d', path(rxHist, true));
		$('.chart-area-tx', svg).setAttribute('d', path(txHist, true));

		var any = false;
		for (var i = 0; i < rxHist.length; i++) {
			if (rxHist[i] > 0 || txHist[i] > 0) { any = true; break; }
		}
		var empty = $('.chart-empty', hero);
		if (empty) {
			empty.textContent = rxHist.length < 2
				? 'Measuring throughput…'
				: 'No WAN traffic in the last 3 minutes';
		}
		hero.setAttribute('data-traffic', any ? 'active' : 'empty');
	}

	function renderUplinks(data) {
		if (!uplinks) return;
		var wan = data.wan || {};
		var list = $('[data-k="uplinks-list"]', uplinks);
		if (!list) return;
		var items = asArray(wan.ifaces);
		var activeLabel = wan.active_label || '';

		heroSet('via', activeLabel ? ' · ' + activeLabel : '');

		var note = $('[data-k="uplinks-note"]', uplinks);
		if (note) {
			var fail = data.failover || {};
			var text = activeLabel ? 'In use: ' + activeLabel : 'No uplink selected';
			if (activeLabel && fail.since) {
				var age = Math.round(Date.now() / 1000) - fail.since;
				if (age > 60) text += ' · stable ' + fmtDuration(age);
			}
			note.textContent = text;
			if (fail.checks) {
				note.title = fail.checks + ' probes · ' + fail.fails + ' failed'
					+ (fail.sim_parked ? ' · SIM parked' : '');
			}
		}

		list.innerHTML = '';
		if (!items.length) {
			var empty = doc.createElement('div');
			empty.className = 'uplinks-empty';
			empty.textContent = 'No WAN interfaces configured';
			list.appendChild(empty);
			return;
		}

		items.forEach(function (w) {
			var row = doc.createElement('div');
			row.className = 'uplink';
			row.setAttribute('data-state', w.in_use ? 'active' : (w.parked ? 'parked' : (w.up ? 'up' : 'down')));

			var dot = doc.createElement('span');
			dot.className = 'uplink-dot';

			var name = doc.createElement('span');
			name.className = 'uplink-name';
			name.textContent = String(w.label || w.name || '').toUpperCase();

			var proto = doc.createElement('span');
			proto.className = 'uplink-proto';
			proto.textContent = String(w.proto || '').toUpperCase();

			var addr = doc.createElement('span');
			addr.className = 'uplink-addr mono';
			addr.textContent = w.ipv4 || (w.parked ? 'no address' : (w.up ? 'addressing…' : 'no address'));

			var badge = doc.createElement('span');
			badge.className = 'uplink-badge';
			badge.textContent = w.state || (w.up ? 'Up' : 'Down');

			row.appendChild(dot);
			row.appendChild(name);
			row.appendChild(proto);
			row.appendChild(addr);
			row.appendChild(badge);

			row.title = [w.label || w.name, w.device, w.ipv4 || w.state]
				.filter(Boolean).join(' · ');
			list.appendChild(row);
		});
	}

	function renderHero(data) {
		if (!hero) return;
		fetchSpeed();
		var wan = data.wan || {};
		var up = !!wan.up;

		heroState(up ? 'up' : 'down');
		renderUplinks(data);
		renderThermals(data);

		var dot = $('.hero-eyebrow .dot', hero);
		if (dot) dot.className = 'dot ' + (up ? 'dot-ok' : 'dot-danger');

		var proto = $('.hero-proto', hero);
		if (proto) {
			var tag = wan.uplink === 'wired' ? 'WIRED' : (wan.uplink ? '5G' : '');
			proto.textContent = [tag, wan.proto ? String(wan.proto).toUpperCase() : '']
				.filter(Boolean).join(' · ');
		}

		heroSet('ip', wan.ipv4 || (up ? 'Addressing…' : 'No WAN address'));
		heroSet('gw', 'Gateway ' + (wan.gateway || '—'));
		heroSet('dns', 'DNS ' + (asArray(wan.dns).length ? asArray(wan.dns).join(' · ') : '—'));
		heroSet('uptime', up ? 'Up ' + fmtDuration(wan.uptime) : 'Link down');

		if (wan.rx_bytes != null) {
			heroSet('totals', fmtBytes(wan.rx_bytes) + ' in · ' + fmtBytes(wan.tx_bytes) + ' out');
		}

		var clients = data.clients || {};
		heroSet('clients', clients.total != null ? clients.total : '—');
		heroSet('clients-foot', 'seen on br-lan');

		var wifi = asArray(data.wifi);
		var ssids = [];
		var bands = [];
		wifi.forEach(function (w) {
			if (w.ssid && ssids.indexOf(w.ssid) === -1) ssids.push(w.ssid);
			if (w.band && w.channel) bands.push((w.band === '5 GHz' ? '5G' : '2.4G') + ' ' + w.channel);
		});
		heroSet('wifi', ssids.length ? ssids.join(' + ') : '—');
		heroSet('wifi-foot', bands.length ? bands.join(' · ') : 'no radios');

		var vpn = asArray(data.vpn);
		var vpnUp = vpn.filter(function (v) { return v.up; }).length;
		heroSet('vpn', vpn.length ? vpnUp + '/' + vpn.length : '—');
		heroSet('vpn-foot', vpn.length ? 'tunnels up' : 'none configured');
		var vpnTile = $('[data-k="vpn"]', hero);
		if (vpnTile && vpnTile.parentNode) {
			vpnTile.parentNode.setAttribute('title', vpn.map(function (v) {
				return v.name + ': ' + (v.up ? 'up' : 'no handshake');
			}).join(' · '));
		}

		var mem = data.mem || {};
		var pct = mem.total ? Math.round((mem.used / mem.total) * 100) : null;
		var cpu = data.cpu || {};
		var load = (data.load && data.load[0] != null) ? data.load[0] : '—';
		heroSet('cpu', cpu.usage != null ? cpu.usage + '%' : '—');
		heroSet('cpu-foot', 'mem ' + (pct != null ? pct + '%' : '—') + ' · load ' + load);
		/* The SoC temperature lives in the Thermals card, but the tile is where
		   a glance lands first, so surface it as a tooltip. */
		var cpuTile = $('[data-k="cpu"]', hero);
		if (cpuTile && cpuTile.parentNode && data.thermal && data.thermal.max) {
			cpuTile.parentNode.setAttribute('title',
				'CPU ' + (cpu.usage != null ? cpu.usage + '%' : '—')
				+ ' · memory ' + (pct != null ? pct + '%' : '—')
				+ ' · load ' + load
				+ ' · SoC ' + (data.thermal.max / 10).toFixed(1) + '°C');
		}

		sample(data);
	}

	var bootedOverview = false;
	var viewTries = 0;
	var viewObserver = null;

	/* The vendor view is rendered client-side from an RPC round trip, which on
	   this box can take 10 s or more on a cold module cache. A fixed number of
	   retries silently gave up and left the page undecorated, so watch the node
	   instead: decorate as soon as the sections exist, however long that takes. */
	function waitForView() {
		var view = $('#view');
		if (view && view.querySelector('.cbi-section')) {
			decorate(view);
			renderHeroFromPoll();
			return;
		}
		if (view && !viewObserver && window.MutationObserver) {
			viewObserver = new MutationObserver(function () {
				if (view.querySelector('.cbi-section')) {
					viewObserver.disconnect();
					viewObserver = null;
					decorate(view);
					renderHeroFromPoll();
				}
			});
			viewObserver.observe(view, { childList: true, subtree: true });
		}
		if (++viewTries > 600) return;   /* ~2 minutes, then give up quietly */
		setTimeout(waitForView, 200);
	}

	function renderHeroFromPoll() {
		if (!hero) return;
		fetchVitals().then(function (data) {
			if (data) renderHero(data);
		});
		if (timer) clearInterval(timer);
		timer = setInterval(function () {
			if (doc.hidden) return;
			fetchVitals().then(function (data) {
				if (data) renderHero(data);
			});
		}, 5000);
	}

	on(doc, 'visibilitychange', function () {
		if (!doc.hidden && hero) renderHeroFromPoll();
	});

	/* --------------------------------------------------------- log exports */

	function elementText(id) {
		var el = document.getElementById(id);
		if (!el) return '';
		if (typeof el.value === 'string')
			return el.value;
		return el.innerText || el.textContent || '';
	}

	function tableCSV(id) {
		var table = document.getElementById(id);
		if (!table) return '';

		function quote(s) {
			return '"' + (s || '').replace(/"/g, '""') + '"';
		}

		var rows = table.querySelectorAll('tr'),
			out = [];

		for (var i = 0; i < rows.length; i++) {
			if (rows[i].style.display === 'none') continue;

			var cells = rows[i].querySelectorAll('th,td'),
				line = [];

			if (!cells.length) continue;

			for (var j = 0; j < cells.length; j++) {
				var txt = (cells[j].innerText || cells[j].textContent || '')
					.replace(/\s+/g, ' ').trim();
				line.push(quote(txt));
			}

			out.push(line.join(','));
		}

		return out.join('\n');
	}

	function copyText(text, btn) {
		function done() {
			if (!btn) return;
			var label = btn.getAttribute('data-label') || btn.textContent;
			btn.setAttribute('data-label', label);
			btn.textContent = 'Copied';
			setTimeout(function () { btn.textContent = label; }, 1200);
		}

		function fallback() {
			var ta = doc.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.left = '-9999px';
			doc.body.appendChild(ta);
			ta.focus();
			ta.select();
			try { doc.execCommand('copy'); done(); }
			catch (e) { window.alert('Copy failed'); }
			doc.body.removeChild(ta);
		}

		if (navigator.clipboard && window.isSecureContext)
			navigator.clipboard.writeText(text).then(done, fallback);
		else
			fallback();
	}

	function downloadText(name, text) {
		var blob = new Blob([text], { type: 'text/plain;charset=utf-8' }),
			url = URL.createObjectURL(blob),
			a = doc.createElement('a');

		a.href = url;
		a.download = name;
		doc.body.appendChild(a);
		a.click();
		setTimeout(function () {
			URL.revokeObjectURL(url);
			a.parentNode && a.parentNode.removeChild(a);
		}, 5000);
	}

	window.awLog = {
		copyEl: function (id, btn) { copyText(elementText(id), btn); },
		downloadEl: function (id, name) { downloadText(name, elementText(id)); },
		copyTable: function (id, btn) { copyText(tableCSV(id), btn); },
		downloadTable: function (id, name) { downloadText(name, tableCSV(id)); }
	};

	/* Physical Interfaces is a read-only table; the page commit bar has nothing
	   to commit there, so hide it while that tab is active. The Blocking Rules
	   page shows the same empty commit bar before the first rule exists. */
	function syncReadonlyTab() {
		var active = $('.tabs > li.active > a, .cbi-tabmenu > li.cbi-tab > a');
		var readonly = !!active && /physical/i.test(active.textContent || '');
		var emptyRules = $('#pc-empty') && !$('#pc-empty').hidden;
		$$('.cbi-page-actions').forEach(function (bar) {
			bar.classList.toggle('is-readonly', readonly || !!emptyRules);
		});
	}

	/* Traffic columns read "—" until the counter sampler has seen a device.
	   A column of dashes is noise, so hide it until it holds a value. */
	function pruneEmptyColumns() {
		var table = $('#pc-device-body');
		if (!table) return;
		var heads = $$('thead th', table.parentNode);
		var rows = $$('tbody tr', table);
		heads.forEach(function (th, i) {
			var label = (th.textContent || '').trim().toLowerCase();
			if (label !== 'uploaded' && label !== 'downloaded') return;
			var empty = rows.every(function (tr) {
				var td = tr.children[i];
				if (!td) return true;
				var t = (td.textContent || '').trim();
				return t === '' || t === '—' || t === '-' || t === '0 B';
			});
			th.classList.toggle('is-empty-col', empty);
			rows.forEach(function (tr) {
				if (tr.children[i]) tr.children[i].classList.toggle('is-empty-col', empty);
			});
		});
	}

	/* Replace the vendor's 16px raster badges with the console sprite. */
	function replaceIfaceGlyphs() {
		$$('img[src*="/luci-static/resources/icons/"]').forEach(function (img) {
			var src = img.getAttribute('src') || '';
			var id = /wifi/.test(src) ? 'i-wifi' : 'i-network';
			var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('viewBox', '0 0 24 24');
			svg.setAttribute('class', 'iface-glyph' + (/_disabled\.png/.test(src) ? ' is-off' : ''));
			svg.setAttribute('aria-hidden', 'true');
			var use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
			use.setAttribute('href', '#' + id);
			svg.appendChild(use);
			if (img.parentNode) img.parentNode.replaceChild(svg, img);
		});

		/* The LAN bridge repeats one badge per sub-device inside "(" ")".
		   Keep the first glyph, drop the punctuation wrapper and the extra
		   tooltip containers. Scope this to the Interfaces page: the Overview
		   WAN card uses the same class for its protocol/address rows. */
		if ((doc.body.getAttribute('data-page') || '') !== 'admin-network-network') return;
		$$('.ifacebox-body').forEach(function (box) {
			var seen = 0;
			Array.prototype.slice.call(box.childNodes).forEach(function (node) {
				if (node.nodeType === 3) {
					if (node.textContent.replace(/[\s()]/g, '') === '') box.removeChild(node);
					return;
				}
				if (node.nodeType !== 1) return;

				if (node.classList.contains('cbi-tooltip-container')) {
					if (seen++) box.removeChild(node);
					return;
				}
				if (node.tagName === 'SPAN') box.removeChild(node);
			});
			var extra = box.querySelectorAll('svg.iface-glyph');
			for (var i = 1; i < extra.length; i++) {
				if (extra[i].parentNode) extra[i].parentNode.removeChild(extra[i]);
			}
		});
	}

	function watchIfaceGlyphs() {
		replaceIfaceGlyphs();
		var timer;
		new MutationObserver(function () {
			clearTimeout(timer);
			timer = setTimeout(replaceIfaceGlyphs, 80);
		}).observe(doc.body, { childList: true, subtree: true });
	}

	/* Split-tunnel status: real handshake age, set size, table-100 route. */
	function fmtAge(s) {
		if (s < 60) return Math.max(1, Math.round(s)) + 's';
		if (s < 3600) return Math.round(s / 60) + 'm';
		if (s < 86400) return Math.round(s / 3600) + 'h';
		return Math.round(s / 86400) + 'd';
	}

	function bootVpnStatus() {
		if ($('.vpn-status')) return true;
		var anchor = $('#maincontent .cbi-map .cbi-section') || $('#maincontent .cbi-section');
		if (!anchor || !window.L) return false;
		fetch(L.url('admin/network/vpnsplit/status'), { credentials: 'same-origin' })
			.then(function (r) { return r.json(); })
			.then(function (d) {
				if ($('.vpn-status')) return;
				var el = doc.createElement('div');
				el.className = 'vpn-status';
				function cell(k, v, cls) {
					var c = doc.createElement('div');
					c.className = 'vpn-cell';
					var a = doc.createElement('span');
					a.className = 'vpn-k';
					a.textContent = k;
					var b = doc.createElement('span');
					b.className = 'vpn-v' + (cls ? ' ' + cls : '');
					b.textContent = v;
					c.appendChild(a);
					c.appendChild(b);
					el.appendChild(c);
				}
				var age = d.handshake_age;
				cell('Tunnel',
					age < 0 ? 'No handshake' : (age < 180 ? 'Up · ' + fmtAge(age) + ' ago' : 'Stale · ' + fmtAge(age) + ' ago'),
					age >= 0 && age < 180 ? 'is-ok' : 'is-warn');
				cell('Split set', d.members + (d.members === 1 ? ' address' : ' addresses'), d.members > 0 ? 'is-ok' : 'is-warn');
				cell('Route', d.route ? 'table 100 → ' + d.route : 'Missing', d.route ? 'is-ok' : 'is-danger');
				cell('Rules', d.domains + ' domains · ' + d.ips + ' networks', '');
				anchor.parentNode.insertBefore(el, anchor);
			})
			.catch(function () {});
		return true;
	}

	/* Vendor Wi-Fi cards never say which band they are; the channel does. */
	function bootWifiBands() {
		var count = 0;
		$$('#maincontent table.cbi-section-table').forEach(function (t) {
			var m = (t.textContent || '').match(/Channel:\s*(\d+)/);
			if (!m) return;
			var row = $$(':scope > tbody > tr', t).filter(function (r) {
				return /Work mode/.test(r.textContent || '');
			})[0];
			if (!row || row.querySelector('.wifi-band')) return;
			var cells = $$('td', row);
			var cell = cells.filter(function (c) { return /MT79\d/.test(c.textContent || ''); })[0] || cells[0];
			if (!cell) return;
			var chip = doc.createElement('span');
			chip.className = 'wifi-band';
			chip.textContent = (+m[1] > 14) ? '5 GHz' : '2.4 GHz';
			cell.appendChild(chip);
			count++;
		});
		return count > 0;
	}

	function retry(fn, tries) {
		if (fn()) return;
		if (tries <= 0) return;
		setTimeout(function () { retry(fn, tries - 1); }, 400);
	}

	function boot() {
		var dispatch = (window.L && L.env && L.env.dispatchpath) ? L.env.dispatchpath.join('-') : '';
		var page = dispatch || doc.body.getAttribute('data-page');
		if (page === OVERVIEW) {
			bootedOverview = true;
			waitForView();
		}
		else if (chip) {
			fetchVitals();
		}

		if (page === 'admin-network-vpnsplit') retry(bootVpnStatus, 8);
		else if (page === 'admin-mtk-wifi') retry(bootWifiBands, 10);
		else if (page === 'admin-network-parental-activity') pruneEmptyColumns();

		/* Password reveal on the login screen. */
		var toggle = $('#pw-toggle');
		var pw = $('#luci_password');
		on(toggle, 'click', function () {
			if (!pw) return;
			var show = pw.type === 'password';
			pw.type = show ? 'text' : 'password';
			toggle.textContent = show ? 'Hide' : 'Show';
			toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
			toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
		});

		syncReadonlyTab();
		on(doc, 'click', function (ev) {
			var tab = ev.target.closest && ev.target.closest('.cbi-tabmenu a, .tabs a');
			if (tab) setTimeout(syncReadonlyTab, 150);
		});
		setInterval(syncReadonlyTab, 900);
		watchIfaceGlyphs();
		if (isMobile()) setDrawer(false);

		setTimeout(function () {
			doc.body.classList.add('is-ready');
		}, 40);
	}

	if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
	else boot();
})();
