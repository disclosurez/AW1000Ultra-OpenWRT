'use strict';
'require baseclass';
'require ui';

return baseclass.extend({
	__init__: function() {
		this.iconMap = {
			status: 'i-gauge',
			tools: 'i-tools',
			network: 'i-network',
			mtk: 'i-wifi',
			services: 'i-grid',
			modem: 'i-signal',
			system: 'i-sliders',
			statistics: 'i-chart',
			logs: 'i-log',
			vpn: 'i-shield'
		};
		this.preferred = [ 'status', 'network', 'tools', 'mtk', 'services', 'modem', 'system', 'statistics', 'logs' ];

		/* Menu hygiene. LuCI also publishes JSON endpoints (ifstats, vitals) and
		   vendor helper pages (test, webcmd, authcode) as menu entries, and this
		   firmware ships dead links (multi_ap, netmode, network/wireless) that
		   404. Keep the URLs reachable, just do not advertise them in the rail. */
		this.hidden = {
			ifstats: 1, vitals: 1,
			test: 1, webcmd: 1, authcode: 1,
			multi_ap: 1, netmode: 1,
			wireless: 1
		};

		/* The telephony section is 30 vendor AT-trigger pages with no labels. */
		this.hiddenSections = { telephony: 1 };

		/* 3ginfo-lite ships "Modem" / "Information about 3G/4G/5G connection";
		   the uplink is the SIM, so both read "Sim Modem". The name map wins
		   over translation; the text map covers a renamed node. */
		this.titleMap = {
			modem: 'Sim Modem',
			'3ginfo-lite': 'Sim Modem'
		};
		this.titleTextMap = {
			'Information about 3G/4G/5G connection': 'Sim Modem'
		};

		ui.menu.load().then(L.bind(this.render, this));
	},

	decode: function(s) {
		return (s || '').replace(/&#(\d+);/g, function(c, n) {
			return String.fromCharCode(+n);
		});
	},

	title: function(node) {
		var text = this.decode(node.title);
		return this.titleMap[node.name] || this.titleTextMap[text] || text;
	},

	icon: function(name, cls) {
		var ns = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('class', cls || 'icon');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');
		var use = document.createElementNS(ns, 'use');
		use.setAttribute('href', '#' + (this.iconMap[name] || ('i-' + name)));
		svg.appendChild(use);
		return svg;
	},

	render: function(tree) {
		this.renderTabMenu(tree);

		var mode = (tree.children && (tree.children[L.env.requestpath[0]] || tree.children.admin));
		if (!mode)
			return;

		var skip = { logout: 1, menu: 1, translations: 1, ubus: 1, uci: 1, telephony: 1 };
		var all = ui.menu.getChildren(mode).filter(L.bind(function(node) {
			return !this.hidden[node.name] && !this.hiddenSections[node.name];
		}, this));
		var ordered = [];

		this.preferred.forEach(L.bind(function(name) {
			var node = all.filter(function(n) { return n.name === name; })[0];
			if (node)
				ordered.push(node);
		}, this));

		all.forEach(function(node) {
			if (ordered.indexOf(node) === -1 && !skip[node.name])
				ordered.push(node);
		});

		this.renderRail(ordered, mode, L.env.requestpath[0] || 'admin');
		this.renderCrumb(mode);
		document.dispatchEvent(new CustomEvent('console:menu'));
	},

	renderRail: function(sections, mode, modeName) {
		var ul = document.querySelector('#topmenu');
		if (!ul)
			return;

		var activeSection = L.env.dispatchpath[1] || '';
		var activeChild = L.env.dispatchpath[2] || '';

		sections.forEach(L.bind(function(section) {
			var children = ui.menu.getChildren(section).filter(L.bind(function(node) {
				return !this.hidden[node.name];
			}, this));
			var isActive = (section.name === activeSection);
			var head;

			if (children.length) {
				head = E('button', {
					'type': 'button',
					'class': 'nav-head',
					'aria-expanded': isActive ? 'true' : 'false',
					'data-section': section.name
				}, [
					this.icon(section.name, 'icon nav-icon'),
					E('span', { 'class': 'nav-label' }, this.title(section)),
					this.icon('chevron', 'icon nav-chev')
				]);
			}
			else {
				head = E('a', {
					'class': 'nav-head',
					'href': L.url(modeName, section.name)
				}, [
					this.icon(section.name, 'icon nav-icon'),
					E('span', { 'class': 'nav-label' }, this.title(section))
				]);
			}

			var item = E('li', {
				'class': 'nav-group' + (isActive ? ' is-active' : '') +
					(isActive ? ' is-open' : ''),
				'data-section': section.name
			}, [ head ]);

			if (children.length) {
				var sub = E('ul', { 'class': 'nav-sub' });
				children.forEach(function(child) {
					var active = isActive && (child.name === activeChild);
					var action = child.action || {};
					/* An alias is a shortcut: link to its real target, not to the
					   alias path, so the page keeps its own tabs and breadcrumb. */
					var target = (action.type === 'alias' && action.path)
						? action.path.split('/')
						: [modeName, section.name, child.name];
					sub.appendChild(E('li', { 'class': 'nav-leaf' + (active ? ' is-active' : '') }, [
						E('a', {
							'href': L.url.apply(L, target),
							'aria-current': active ? 'page' : null
						}, this.title(child))
					]));
				}, this);
				item.appendChild(sub);
			}

			ul.appendChild(item);
		}, this));

		ul.style.display = '';
		ul.parentNode.classList.add('is-ready');
	},

	renderCrumb: function(mode) {
		var crumb = document.querySelector('#crumb');
		if (!crumb)
			return;
		var path = L.env.dispatchpath || [];
		var node = mode, bits = [];

		for (var i = 1; i < path.length - 1; i++) {
			node = node && node.children && node.children[path[i]];
			if (!node)
				break;
			var url = L.url.apply(L, path.slice(0, i + 1));
			bits.push(E('a', { 'href': url }, this.title(node)));
		}

		if (!bits.length) {
			node = mode.children && mode.children[path[1]];
			if (node)
				bits.push(E('span', {}, this.title(node)));
		}

		bits.forEach(function(el, idx) {
			if (idx)
				crumb.appendChild(E('span', { 'class': 'crumb-sep' }, '/'));
			crumb.appendChild(el);
		});
	},

	renderTabMenu: function(tree, url, level) {
		if (L.env.dispatchpath.length < 3)
			return;

		var node = tree;
		url = url || '';
		for (var i = 0; i < 3 && node; i++) {
			node = node.children[L.env.dispatchpath[i]];
			url = url + (url ? '/' : '') + L.env.dispatchpath[i];
		}
		if (node)
			this.renderTabsFor(node, url, 0);
	},

	renderTabsFor: function(tree, url, level) {
		var container = document.querySelector('#tabmenu');
		if (!container)
			return;

		var ul = E('ul', { 'class': 'tabs' });
		var children = ui.menu.getChildren(tree);
		var activeNode = null;

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.dispatchpath[3 + level] === children[i].name);
			ul.appendChild(E('li', { 'class': isActive ? 'active' : null }, [
				E('a', { 'href': L.url(url, children[i].name) }, this.title(children[i]))
			]));
			if (isActive)
				activeNode = children[i];
		}

		if (!ul.children.length)
			return;

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabsFor(activeNode, url + '/' + activeNode.name, level + 1);
	}
});
