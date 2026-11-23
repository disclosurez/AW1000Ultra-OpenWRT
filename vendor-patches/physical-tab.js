s=m.section(form.TypedSection,'network','physical',_('Physical Interfaces'));
s.anonymous=true;
s.addremove=false;
s.render=function(){
	var wrap=E('div',{'class':'cbi-section','id':'cbi-network-physical','data-tab':'physical','data-tab-title':_('Physical Interfaces')});
	var desc=E('p',{'class':'cbi-section-descr'},_('Link state and throughput of the physical interfaces bridged into the LAN. Rates are averaged over the last few seconds. Rows with a device count expand to show the addresses seen on that interface.'));
	var tbl=E('table',{'class':'cbi-section-table pi-table'});
	tbl.appendChild(E('thead',{},[
		E('tr',{'class':'cbi-section-table-titles'},[
			E('th',{'class':'cbi-section-table-cell'},_('Interface')),
			E('th',{'class':'cbi-section-table-cell'},_('Status')),
			E('th',{'class':'cbi-section-table-cell'},_('MAC address')),
			E('th',{'class':'cbi-section-table-cell'},_('IP addresses')),
			E('th',{'class':'cbi-section-table-cell'},_('Link speed')),
			E('th',{'class':'cbi-section-table-cell'},_('Duplex')),
			E('th',{'class':'cbi-section-table-cell'},_('RX rate')),
			E('th',{'class':'cbi-section-table-cell'},_('TX rate')),
			E('th',{'class':'cbi-section-table-cell'},_('RX total')),
			E('th',{'class':'cbi-section-table-cell'},_('TX total'))
		])
	]));
	var tbody=E('tbody');
	tbl.appendChild(tbody);
	wrap.appendChild(desc);
	wrap.appendChild(tbl);

	var rows={};

	function fmt(b){
		b=+b||0;
		if(b>=1073741824)return (b/1073741824).toFixed(2)+' GB';
		if(b>=1048576)return (b/1048576).toFixed(1)+' MB';
		if(b>=1024)return (b/1024).toFixed(1)+' kB';
		return b+' B';
	}
	function rate(v){
		v=+v||0;
		if(v>=1000000)return (v/1000000).toFixed(2)+' Mbit/s';
		if(v>=1000)return (v/1000).toFixed(1)+' kbit/s';
		return v.toFixed(0)+' bit/s';
	}
	function ensureRow(name){
		if(rows[name])
			return rows[name];
		var stateEl=E('span',{'class':'pi-state is-idle'},'—');
		var c={
			stateEl:stateEl,
			status:E('td',{'class':'cbi-value-field'},[stateEl]),
			mac:E('td',{'class':'cbi-value-field pi-mono'},'—'),
			ips:E('td',{'class':'cbi-value-field pi-mono'},'—'),
			speed:E('td',{'class':'cbi-value-field pi-mono'},'—'),
			duplex:E('td',{'class':'cbi-value-field'},'—'),
			rxr:E('td',{'class':'cbi-value-field pi-mono'},'—'),
			txr:E('td',{'class':'cbi-value-field pi-mono'},'—'),
			rxt:E('td',{'class':'cbi-value-field pi-mono'},'—'),
			txt:E('td',{'class':'cbi-value-field pi-mono'},'—')
		};
		var tr=E('tr',{'class':'cbi-section-table-row pi-row'},[
			E('td',{'class':'cbi-value-field'},[c.nameCell=E('strong',{'class':'pi-name','style':'cursor:inherit'},name)]),
			c.status,c.mac,c.ips,c.speed,c.duplex,c.rxr,c.txr,c.rxt,c.txt
		]);
		var detailTd=E('td',{'colspan':10,'class':'pi-detail'},[]);
		detailTd.hidden=true;
		var detail=E('tr',{},[detailTd]);
		tr.addEventListener('click',function(){
			if(!c.data || !c.data.ips || !c.data.ips.length)
				return;
			var show=detailTd.hidden;
			detailTd.hidden=!show;
			if(show)
				fillDetail(c,c.data);
		});
		tbody.appendChild(tr);
		tbody.appendChild(detail);
		c.detail=detail;
		c.tr=tr;
		rows[name]=c;
		return c;
	}
	function fillDetail(c,d){
		var box=c.detail.firstChild;
		while(box.firstChild)
			box.removeChild(box.firstChild);
		var t=E('table');
		for(var i=0;i<d.ips.length;i++){
			t.appendChild(E('tr',{},[
				E('td',{'class':'pi-mono'},[E('code',{},d.ips[i].ip)]),
				E('td',{'class':'pi-mono'},[E('code',{},d.ips[i].mac)]),
				E('td',{'class':'pi-muted'},d.ips[i].host||'')
			]));
		}
		box.appendChild(t);
	}
	function update(){
		return fetch(L.url('admin/network/ifstats'),{credentials:'same-origin'}).then(function(r){
			return r.json();
		}).then(function(list){
			for(var i=0;i<list.length;i++){
				var d=list[i],c=ensureRow(d.name);
				var st=d.state||'unknown';
				c.stateEl.className='pi-state '+(st=='up'?'is-up':(st=='down'?'is-down':'is-idle'));
				c.stateEl.textContent=st;
				var sp=d.speed, isRadio=/^ra/i.test(d.name);
				if(isRadio)
					c.speed.textContent=(sp&&sp!='0')?sp+' Mbit/s (radio)':'—';
				else
					c.speed.textContent=(sp&&sp!='0'&&sp!='4294967295')?sp+' Mbit/s':'—';
				c.mac.textContent=d.mac||'—';
				var n=(d.ips&&d.ips.length)||0;
				c.ips.textContent=n?n:'—';
				c.ips.title=n?n+' '+(n==1?'address':'addresses'):'';
				c.nameCell.textContent=d.name+(n?' ▸':'');
				c.tr.style.cursor=n?'pointer':'default';
				c.data=d;
				if(!c.detail.firstChild.hidden)
					fillDetail(c,d);
				c.duplex.textContent=(!isRadio&&d.duplex)?d.duplex:'—';
				c.rxr.textContent=rate(d.rxrate);
				c.txr.textContent=rate(d.txrate);
				c.rxt.textContent=fmt(d.rx);
				c.txt.textContent=fmt(d.tx);
			}
		}).catch(function(){
			if(!tbody.firstChild)
				tbody.appendChild(E('tr',{},[E('td',{'colspan':10},[E('em',{},_('Unable to read interface statistics.'))])]));
		});
	}

	update();
	setTimeout(update,1500);
	setInterval(update,5000);

	return wrap;
};
