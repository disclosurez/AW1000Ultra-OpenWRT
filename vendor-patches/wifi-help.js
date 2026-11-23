/* Plain-language help for the vendor Wi-Fi pages.
 *
 * The vendor pages are generated from mtk_wifi_overview.htm,
 * mtk_wifi_vif_cfg.htm and mtk_wifi_dev_cfg.htm.  Each template loads this
 * file and calls WifiHelp.init('overview'|'vif'|'devcfg').  The help text and
 * the friendly labels live here so the three pages stay consistent.
 */
(function () {
	"use strict";

	var SECURITY_LABELS = {
		"Disable": "Disabled (no security)",
		"OPEN": "Open (no password)",
		"Enhanced Open": "Enhanced Open (OWE, no password)",
		"SHARED": "Shared key (legacy)",
		"WEPAUTO": "WEP (legacy, insecure)",
		"WPA2": "WPA2 (recommended)",
		"WPA3": "WPA3 (recommended)",
		"WPA3-192-bit": "WPA3 192-bit (enterprise)",
		"WPA2PSK": "WPA2-PSK (recommended)",
		"WPA3PSK": "WPA3-PSK (recommended)",
		"WPAPSKWPA2PSK": "WPA/WPA2 mixed (legacy)",
		"WPA2PSKWPA3PSK": "WPA2/WPA3 mixed (recommended)",
		"WPA1WPA2": "WPA/WPA2 mixed (legacy)",
		"IEEE8021X": "WPA-Enterprise (802.1X)"
	};

	var ENCRYPTION_LABELS = {
		"WEP": "WEP (legacy, insecure)",
		"TKIP": "TKIP (legacy)",
		"TKIPAES": "TKIP/AES mixed",
		"AES": "AES (recommended)",
		"GCMP256": "GCMP-256 (WPA3)"
	};

	var MODE_LABELS = {
		"A only": "802.11a (legacy, 5 GHz)",
		"A/N in 5 band": "Wi-Fi 4 / 802.11n (5 GHz)",
		"HE_5G mode": "Wi-Fi 6 / 802.11ax (5 GHz) — recommended",
		"A/AC/AN mixed": "Wi-Fi 5/4 mixed (802.11ac/n/a)",
		"AC/AN mixed": "Wi-Fi 5/4 mixed (802.11ac/n)",
		"B only": "802.11b (legacy, 2.4 GHz)",
		"G only": "802.11g (legacy, 2.4 GHz)",
		"B/G mixed": "802.11b/g (legacy, 2.4 GHz)",
		"N only": "Wi-Fi 4 / 802.11n",
		"HE_2G mode": "Wi-Fi 6 / 802.11ax (2.4 GHz) — recommended",
		"AC only": "Wi-Fi 5 / 802.11ac",
		"AX only": "Wi-Fi 6 / 802.11ax",
		"BE only": "Wi-Fi 7 / 802.11be"
	};

	var PAGES = {
		vif: {
			note: `<b>Quick start:</b> most home networks only need <b>Network name</b>, <b>Security mode</b> and <b>Wi-Fi password</b>. Hover the <span class="wifi-info" data-tip="Every setting has a plain-language explanation." aria-label="Every setting has a plain-language explanation." tabindex="0">i</span> icons for help. Everything else is under <b>Show advanced settings</b>.`,
			labels: {
				"SSID": "Network name (SSID)",
				"Auth Mode": "Security mode",
				"Key": "Wi-Fi password",
				"Pass-phrase": "Wi-Fi password",
				"Hidden": "Hide network name",
				"Mode": "Wi-Fi standard",
				"AP Isolation": "Client isolation",
				"WMM Capable": "WMM (voice/video priority)",
				"TX Rate": "Max TX rate",
				"Default Key": "Default WEP key",
				"WEP Key 1": "WEP key 1",
				"WEP Key 2": "WEP key 2",
				"WEP Key 3": "WEP key 3",
				"WEP Key 4": "WEP key 4",
				"Key Type 1": "WEP key type 1",
				"Key Type 2": "WEP key type 2",
				"Key Type 3": "WEP key type 3",
				"Key Type 4": "WEP key type 4",
				"Key Renewal Interval": "Key renewal interval",
				"PMK Cache Period": "PMK cache period",
				"Pre-Authentication": "Pre-authentication",
				"MFPC": "MFPC (PMF required)",
				"MFPR": "MFPR (PMF roaming)",
				"MFPSHA256": "MFPSHA256 (PMF SHA-256)",
				"WEP for 8021X": "WEP for 802.1X",
				"Radius Server IP": "RADIUS server",
				"Radius Server Port": "RADIUS port",
				"Shared Secret": "RADIUS shared secret",
				"Session Timeout": "Session timeout",
				"Idle Timeout": "Idle timeout",
				"DLS Capable": "DLS (direct link)",
				"APSD Capable": "APSD (power save)",
				"Fragment Threshold": "Fragment threshold",
				"RTS Threshold": "RTS threshold",
				"VHT Short GI": "Short guard interval (VHT)",
				"VHT BW Signaling": "Bandwidth signaling (VHT)",
				"HT Protection": "HT protection",
				"HT Guard Interval": "Guard interval (HT)",
				"Operating Mode": "HT operating mode",
				"A-MSDU": "A-MSDU aggregation",
				"Auto Block ACK": "Auto block ACK",
				"IGMP Snooping": "IGMP snooping",
				"STBC": "STBC (antenna diversity)",
				"HT LDPC": "LDPC (HT)",
				"VHT STBC": "STBC (VHT)",
				"VHT LDPC": "LDPC (VHT)"
			},
			help: {
				"SSID": "The network name people see when they scan for Wi-Fi. Use a short, recognisable name.",
				"Auth Mode": "How devices prove they are allowed to join. WPA2 or WPA3 is recommended; OPEN and WEP are insecure.",
				"Encryption": "The cipher used with the security mode. AES is the normal choice; TKIP and WEP are legacy.",
				"Key Renewal Interval": "How often the encryption key is refreshed. Leave the default unless you have a reason to change it.",
				"Key": "The Wi-Fi password. Use at least 8 characters; longer is better.",
				"Pass-phrase": "The Wi-Fi password. Use at least 8 characters; longer is better.",
				"Default Key": "Legacy WEP key selection. WEP is insecure — use WPA2 or WPA3 instead.",
				"WEP Key 1": "Legacy WEP key. WEP is insecure — use WPA2 or WPA3 instead.",
				"WEP Key 2": "Legacy WEP key. WEP is insecure — use WPA2 or WPA3 instead.",
				"WEP Key 3": "Legacy WEP key. WEP is insecure — use WPA2 or WPA3 instead.",
				"WEP Key 4": "Legacy WEP key. WEP is insecure — use WPA2 or WPA3 instead.",
				"Key Type 1": "Legacy WEP key format (ASCII or Hex).",
				"Key Type 2": "Legacy WEP key format (ASCII or Hex).",
				"Key Type 3": "Legacy WEP key format (ASCII or Hex).",
				"Key Type 4": "Legacy WEP key format (ASCII or Hex).",
				"PMK Cache Period": "How long a device can reuse a cached key before re-authenticating. The default is fine.",
				"Pre-Authentication": "Lets a device authenticate to the next access point before roaming. Useful for fast roaming in enterprise setups.",
				"MFPC": "Protected Management Frames: required. Stops forged management frames; very old devices may not support it.",
				"MFPR": "Protected Management Frames: required for roaming. Usually on with WPA3.",
				"MFPSHA256": "Use SHA-256 for protected management frames. Leave on unless an old device fails to join.",
				"WEP for 8021X": "Legacy WEP with 802.1X. Not recommended.",
				"Radius Server IP": "Enterprise Wi-Fi (802.1X) RADIUS server address. Home networks do not use this.",
				"Radius Server Port": "RADIUS server port. The default is 1812.",
				"Shared Secret": "RADIUS shared secret. Only needed for enterprise Wi-Fi.",
				"Session Timeout": "How long an enterprise session lasts before re-authentication.",
				"Idle Timeout": "How long an idle enterprise session is kept.",
				"Hidden": "Hides the network name from scans. Devices must enter the name manually. It does not add real security.",
				"Guest network": "Puts this SSID on an isolated guest bridge (192.168.5.0/24). Guests can reach the internet and the captive portal, but not the LAN or router management.",
				"AP Isolation": "Prevents Wi-Fi clients from talking to each other. Useful for guest networks.",
				"WMM Capable": "Wi-Fi Multimedia prioritises voice and video traffic. Leave on unless a device has problems.",
				"TX Rate": "Caps the transmit rate. 0 means automatic; leave it alone unless troubleshooting.",
				"STBC": "Space-Time Block Coding improves reliability on multiple antennas. Leave on.",
				"HT LDPC": "Low-density parity check improves error correction on Wi-Fi 4. Leave on.",
				"VHT STBC": "STBC for Wi-Fi 5. Leave on.",
				"VHT LDPC": "LDPC for Wi-Fi 5. Leave on.",
				"Mode": "The Wi-Fi standard this network uses. Wi-Fi 6 (802.11ax) is newer and faster than Wi-Fi 5 (802.11ac) and Wi-Fi 4 (802.11n). Choose the newest one your devices support; older devices can usually still connect.",
				"DLS Capable": "Direct Link Setup lets two clients talk directly. Rarely needed.",
				"APSD Capable": "Automatic Power Save Delivery saves battery on some phones. Leave on.",
				"Fragment Threshold": "Splits large packets. Lower values can help in noisy air; the default is fine.",
				"RTS Threshold": "Controls when a device asks for permission before sending. Lower values can help with hidden nodes; the default is fine.",
				"VHT Short GI": "Short guard interval gives a small speed boost on Wi-Fi 5. Short is usually fine.",
				"VHT BW Signaling": "How bandwidth changes are signalled. Dynamic or auto is the safe choice.",
				"HT Protection": "Protects older 802.11b/g devices from interference. Leave on.",
				"HT Guard Interval": "Gap between symbols. Auto is the safe choice.",
				"Operating Mode": "HT mixed mode works with older devices; Green Field is faster but only for 802.11n devices.",
				"A-MSDU": "Batches packets to reduce overhead. Leave on.",
				"Auto Block ACK": "Acknowledges batches of packets. Leave on.",
				"IGMP Snooping": "Sends multicast (IPTV) only to devices that asked for it. Leave on."
			},
			modes: MODE_LABELS
		},

		overview: {
			note: `<b>Mode</b> is the Wi-Fi standard (Wi-Fi 4/5/6). Newer numbers are faster; older devices can usually still connect. Click <b>Config</b> to change a network.`,
			help: {},
			labels: {}
		},

		devcfg: {
			note: `<b>Radio settings.</b> Most home networks only need <b>Channel</b> and <b>Transmit power</b>. Leave the rest alone unless you have a reason to change it. Hover the <span class="wifi-info" data-tip="Every setting has a plain-language explanation." aria-label="Every setting has a plain-language explanation." tabindex="0">i</span> icons for help.`,
			labels: {
				"Channel BandWidth": "Channel bandwidth",
				"TX Power": "Transmit power",
				"Country Code": "Country",
				"Country Region": "Country region",
				"BSS color": "BSS color (Wi-Fi 6)",
				"TWT Support": "Target Wake Time (TWT)",
				"Individual TWT Support": "Individual TWT",
				"HE LDPC": "LDPC (Wi-Fi 6)",
				"TxOP duration RTS threshold": "TXOP duration / RTS threshold",
				"Co-located BSSID set max index": "Co-located BSSID max index",
				"40MHz HT Ext Channel": "40 MHz extension channel",
				"80MHz Second VHT Channel": "80 MHz second channel",
				"HT TX Stream": "TX streams (HT)",
				"HT RX Stream": "RX streams (HT)",
				"DL OFDMA": "Downlink OFDMA",
				"UL OFDMA": "Uplink OFDMA",
				"DL MU-MIMO": "Downlink MU-MIMO",
				"UL MU-MIMO": "Uplink MU-MIMO",
				"Beam Forming & MIMO 4": "Beamforming & MIMO",
				"Spatial Reuse": "Spatial reuse",
				"SSID Broadcast": "Broadcast network name",
				"Extension Channel": "Extension channel",
				"Dual Band Dual Channel": "Dual-band dual-channel",
				"Power Boost": "Power boost"
			},
			help: {
				"Channel": "The radio channel. Auto lets the router choose. On 2.4 GHz, 1/6/11 are the non-overlapping choices; on 5 GHz, higher channels are usually less crowded. Changing this disconnects clients briefly.",
				"BSS color": "Wi-Fi 6 identifier that helps nearby networks share airtime. Leave 0/auto unless troubleshooting.",
				"Co-located BSSID set max index": "Advanced Wi-Fi 6 multi-BSSID setting. Leave the default.",
				"TWT Support": "Target Wake Time lets Wi-Fi 6 devices sleep longer and save battery. Enable is usually fine.",
				"Individual TWT Support": "Per-device Target Wake Time. Leave the default.",
				"HE LDPC": "Error correction for Wi-Fi 6. Leave enabled.",
				"TxOP duration RTS threshold": "Limits how long a device can hold the channel. Leave the default.",
				"Country Code": "Regulatory country. It controls allowed channels and transmit power. Set it to your country; do not change it otherwise.",
				"Country Region": "Regulatory region within the country. Leave the default unless you know the local rules.",
				"Channel BandWidth": "How wide the channel is. Wider is faster but uses more spectrum: 20/40 MHz for 2.4 GHz, 80 MHz is a good 5 GHz default, 160 MHz is fastest but most fragile.",
				"40MHz HT Ext Channel": "Which side channel is used for 40 MHz. Auto is fine.",
				"80MHz Second VHT Channel": "Which 80 MHz segment is used. Auto is fine.",
				"HT TX Stream": "Number of transmit streams. Higher is faster but depends on antennas. Leave the maximum.",
				"HT RX Stream": "Number of receive streams. Higher is faster but depends on antennas. Leave the maximum.",
				"TX Power": "Radio transmit power as a percentage. 100% is maximum; lower it to reduce interference or if the signal is too strong.",
				"802.11H": "DFS/TPC support for 5 GHz. Leave enabled if your country requires it.",
				"DL OFDMA": "Wi-Fi 6 downlink OFDMA shares the channel more efficiently. Leave enabled.",
				"UL OFDMA": "Wi-Fi 6 uplink OFDMA shares the channel more efficiently. Leave enabled.",
				"DL MU-MIMO": "Wi-Fi 6 downlink multi-user MIMO serves several devices at once. Leave enabled.",
				"UL MU-MIMO": "Wi-Fi 6 uplink multi-user MIMO serves several devices at once. Leave enabled.",
				"Beam Forming & MIMO 4": "Focuses the signal toward clients. Higher values use more antennas. Leave the default.",
				"Spatial Reuse": "Wi-Fi 6 feature that lets nearby networks reuse spectrum. Leave enabled.",
				"SSID Broadcast": "Whether the network name is broadcast. Hiding it does not add real security.",
				"Extension Channel": "Secondary channel for 40 MHz. Auto is fine.",
				"Dual Band Dual Channel": "Advanced dual-band operation. Leave the default.",
				"Power Boost": "Raises transmit power above the standard limit. Leave off unless you know what you are doing."
			}
		}
	};

	var tipEl = null;

	function closest(el) {
		return el && el.closest ? el.closest(".wifi-info") : null;
	}

	function ensureTip() {
		if (!tipEl) {
			tipEl = document.createElement("div");
			tipEl.className = "wifi-tip";
			document.body.appendChild(tipEl);
		}
		return tipEl;
	}

	function showTip(el) {
		var text = el.getAttribute("data-tip");
		if (!text) return;
		var tip = ensureTip();
		tip.textContent = text;
		tip.style.display = "block";
		var r = el.getBoundingClientRect();
		var top = r.top - tip.offsetHeight - 8;
		if (top < 8) top = r.bottom + 8;
		var left = r.left + r.width / 2 - tip.offsetWidth / 2;
		left = Math.max(8, Math.min(left, window.innerWidth - tip.offsetWidth - 8));
		tip.style.top = top + "px";
		tip.style.left = left + "px";
	}

	function hideTip() {
		if (tipEl) tipEl.style.display = "none";
	}

	document.addEventListener("mouseover", function (e) {
		var el = closest(e.target);
		if (el) showTip(el);
	});
	document.addEventListener("mouseout", function (e) {
		if (closest(e.target)) hideTip();
	});
	document.addEventListener("focusin", function (e) {
		var el = closest(e.target);
		if (el) showTip(el);
	});
	document.addEventListener("focusout", hideTip);
	document.addEventListener("click", function (e) {
		var el = closest(e.target);
		if (el) {
			e.preventDefault();
			showTip(el);
		}
	});
	window.addEventListener("scroll", hideTip, true);
	window.addEventListener("resize", hideTip);

	function addIcon(td, text) {
		var span = document.createElement("span");
		span.className = "wifi-info";
		span.setAttribute("data-tip", text);
		span.setAttribute("aria-label", text);
		span.setAttribute("tabindex", "0");
		span.textContent = "i";
		td.appendChild(document.createTextNode(" "));
		td.appendChild(span);
	}

	function addNote(page) {
		var html = PAGES[page] && PAGES[page].note;
		if (!html || document.getElementById("wifi-help-note")) return;

		var note = document.createElement("div");
		note.id = "wifi-help-note";
		note.className = "wifi-help-note";
		note.innerHTML = html;

		if (page === "vif") {
			var tbody = document.getElementById("VIF_CFG_BASIC_SETTINGS");
			if (!tbody) return;
			var tr = document.createElement("tr");
			var td = document.createElement("td");
			td.colSpan = 3;
			td.appendChild(note);
			tr.appendChild(td);
			tbody.insertBefore(tr, tbody.firstChild);
		} else if (page === "overview") {
			var h2 = document.querySelector("#maincontent h2");
			if (h2) h2.parentNode.insertBefore(note, h2.nextSibling);
		} else if (page === "devcfg") {
			var legend = document.querySelector("#maincontent legend");
			if (legend) {
				legend.parentNode.insertBefore(note, legend.nextSibling);
			} else {
				var main = document.getElementById("maincontent");
				if (main) main.insertBefore(note, main.firstChild);
			}
		}
	}

	function addIcons(page) {
		var help = (PAGES[page] && PAGES[page].help) || {};
		var labels = (PAGES[page] && PAGES[page].labels) || {};
		var rows = document.querySelectorAll("#maincontent tr");

		for (var i = 0; i < rows.length; i++) {
			var td = rows[i].querySelector("td");
			if (!td || td.querySelector(".wifi-info")) continue;
			var text = (td.textContent || "").trim();
			if (!text || text.length > 80) continue;
			var tip = help[text];
			var label = labels[text];
			if (label) td.textContent = label;
			if (tip) addIcon(td, tip);
		}
	}

	function fixSelect(id, map, stripPrefix) {
		var sel = document.getElementById(id);
		if (!sel || sel.tagName !== "SELECT") return;
		for (var i = 0; i < sel.options.length; i++) {
			var opt = sel.options[i];
			var text = (opt.textContent || "").trim();
			var name = text;
			if (stripPrefix) {
				var m = text.match(/^\d+\s*-\s*(.+)$/);
				if (m) name = m[1].trim();
			}
			if (map[name]) opt.textContent = map[name];
		}
	}

	function fixModes() {
		fixSelect("WirelessMode", MODE_LABELS, true);
		fixSelect("AuthMode", SECURITY_LABELS, false);
		fixSelect("__encrypttype", ENCRYPTION_LABELS, false);
	}

	/* The vendor Add form defaults to "Disable" security and the first
	   (usually legacy) mode. Pick safe defaults for a new network only. */
	function secureDefaults() {
		var action = document.querySelector('input[name="__action"]');
		if (!action || action.value !== "vif_add_view") return;

		var auth = document.getElementById("AuthMode");
		if (auth && (auth.value === "Disable" || auth.value === "" || auth.selectedIndex === 0)) {
			auth.value = "WPA2PSK";
			if (typeof AuthMode_onchange === "function") AuthMode_onchange("WPA2PSK");
		}

		var mode = document.getElementById("WirelessMode");
		if (mode) {
			var best = null;
			for (var i = 0; i < mode.options.length; i++) {
				var t = mode.options[i].textContent;
				if (t.indexOf("recommended") !== -1) { best = mode.options[i]; break; }
				if (!best && /Wi-Fi [56]/.test(t)) best = mode.options[i];
			}
			if (best && (mode.selectedIndex === 0 || /legacy/.test(mode.options[mode.selectedIndex].textContent))) {
				mode.value = best.value;
			}
		}
	}

	function init(page) {
		function run() {
			addNote(page);
			addIcons(page);
			if (page === "vif") { fixModes(); secureDefaults(); }
		}
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", run);
		} else {
			run();
		}
	}

	window.WifiHelp = { init: init };
})();
