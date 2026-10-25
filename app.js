/* 北越十日 2026 — 互動邏輯（無框架，資料在 data.js 的 window.TRIP） */
(function () {
  'use strict';
  const T = window.TRIP;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- 本機儲存（可能被封鎖，一律 try/catch） ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bv10.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bv10.' + k, JSON.stringify(v)); } catch (e) { /* 無法儲存時照常運作 */ } },
  };

  /* ---------- 圖示 ---------- */
  const ICON = {
    flight: '<path d="M10.5 13.5 3 11l1.5-1.5 8 1 4-4c.8-.8 2.2-.8 2.5 0 .3.4.2 1.3-.5 2l-4 4 1 8L14 22l-2.5-7.5-3 3V20l-1.5 1-1-3-3-1 1-1.5h2.5z"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l-2-4M15 21l2-4M9 14h.01M15 14h.01"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 10h16M7 21v-3M17 21v-3M8 14h.01M16 14h.01"/>',
    car: '<path d="M5 17h14v-5l-2-5H7l-2 5zM5 12h14"/><circle cx="8" cy="17" r="1.8"/><circle cx="16" cy="17" r="1.8"/>',
    walk: '<circle cx="13" cy="4" r="2"/><path d="m9 21 2-6 3 3v3M8 12l3-4 4 2 2 3M11 8l-1 5"/>',
    food: '<path d="M4 11h16a8 8 0 0 1-16 0zM8 7c0-1.5 1-2 1-3M12 7c0-1.5 1-2 1-3M16 7c0-1.5 1-2 1-3"/>',
    sight: '<path d="M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6"/>',
    hotel: '<path d="M3 20V6M3 13h18v7M21 13a3 3 0 0 0-3-3h-7v3M7 11.5a1.5 1.5 0 1 0 0-.01"/>',
    mountain: '<path d="m3 20 6-11 4 6 2-3 6 8z"/>',
    boat: '<path d="M3 15h18l-3 5H6zM12 15V4l6 9"/>',
    spa: '<path d="M12 21c-4 0-7-3-7-7 3 0 7 2 7 7zm0 0c4 0 7-3 7-7-3 0-7 2-7 7zm0 0V11M12 11c-2-2-2-5 0-7 2 2 2 5 0 7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    nav: '<path d="m3 11 18-8-8 18-2-8z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    show: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
    bowl: '<path d="M3 11h18a9 9 0 0 1-18 0zM7 7l10-4"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 0 4v5h18v-5a2 2 0 0 1 0-4V3H3zM14 3v14"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  };
  const icon = (n, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${ICON[n] || ICON.info}</svg>`;

  /* ---------- 狀態徽章 ---------- */
  const STATUS = {
    booked: '已訂', confirm: '待確認', todo: '待訂', suggest: '建議', unverified: '資訊未確認',
  };
  const badge = (s, label) => s ? `<span class="badge b-${s}">${esc(label || STATUS[s] || s)}</span>` : '';

  /* ---------- Google Maps 連結 ---------- */
  const gmSearch = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  const gmNav = (q, mode) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}${mode ? '&travelmode=' + mode : ''}`;
  const gmRoute = (qs, mode) => {
    if (qs.length < 2) return gmSearch(qs[0]);
    const p = new URLSearchParams({ api: '1', origin: qs[0], destination: qs[qs.length - 1] });
    if (qs.length > 2) p.set('waypoints', qs.slice(1, -1).join('|'));
    if (mode) p.set('travelmode', mode);
    return 'https://www.google.com/maps/dir/?' + p.toString();
  };
  const P = (id) => T.places[id];
  const placeQ = (p) => p.q || [p.vn || p.name, p.addr].filter(Boolean).join(', ');

  const placeButtons = (id, mode) => {
    const p = P(id); if (!p) return '';
    return `<div class="acts">
      <a class="btn" href="${gmSearch(placeQ(p))}" target="_blank" rel="noopener">${icon('pin')}地圖</a>
      <a class="btn" href="${gmNav(placeQ(p), mode)}" target="_blank" rel="noopener">${icon('nav')}導航</a>
      ${p.addr ? `<button class="btn ghost" type="button" data-show-place="${esc(id)}" aria-label="出示越南文地址給司機">${icon('show')}給司機</button>` : ''}
    </div>`;
  };

  /* ---------- 時間（以越南時間判斷今天） ---------- */
  const vnToday = () => {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  };
  const vnNowHM = () => {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
    catch (e) { return '00:00'; }
  };
  const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const todayDay = () => T.days.find((d) => d.date === vnToday());

  /* ---------- 版面骨架 ---------- */
  const app = $('#app');
  let view = 'itinerary';
  let currentDay = T.days[0].id;
  let mapRegion = 'all';
  let foodRegion = 'hanoi';

  function heroHTML() {
    const today = vnToday();
    const n = dayDiff(today, T.meta.start);
    const td = todayDay();
    let status;
    if (td) status = `<span class="count">今天是第 <b class="num">${T.days.indexOf(td) + 1}</b> 天・${esc(td.city)}</span>`;
    else if (n > 0) status = `<span class="count">距離出發還有 <b class="num">${n}</b> 天</span>`;
    else status = `<span class="count">旅程已結束，可回顧行程</span>`;
    return `<div class="hero"><div class="wrap">
      <div class="eyebrow" style="color:var(--on-band-2)">2026 · 11 / 2 — 11 / 11 · 10 天 9 夜</div>
      <h1>北越十日</h1>
      <div class="route">河內 <i>→</i> 老街（夜車） <i>→</i> 沙壩 4 晚 <i>→</i> 河內（夜巴） <i>→</i> 寧平一日 <i>→</i> 河內</div>
      <div class="status">${status}<span class="count">${badge('booked')} ${countStatus('booked')}　${badge('confirm')} ${countStatus('confirm')}　${badge('todo')} ${countStatus('todo')}</span></div>
    </div></div>`;
  }
  const countStatus = (s) => T.bookings.filter((b) => b.status === s).length;

  /* ---------- 行程 ---------- */
  function renderItinerary() {
    const d = T.days.find((x) => x.id === currentDay) || T.days[0];
    const td = todayDay();
    const isToday = td && td.id === d.id;
    const now = vnNowHM();
    let nextMarked = false;

    const chips = T.days.map((x, i) => `<button type="button" class="day-chip${td && td.id === x.id ? ' is-today' : ''}" aria-pressed="${x.id === d.id}" data-day="${x.id}">
      <span class="w">D${i + 1}・週${x.dow}</span><span class="d">${Number(x.date.slice(5, 7))}/${Number(x.date.slice(8))}</span><span class="c">${esc(x.city)}</span></button>`).join('');

    const facts = (d.facts || []).map((f) => `<div class="fact"><span class="k">${esc(f.k)}</span><span class="v">${f.html || esc(f.v)} ${f.status ? badge(f.status) : ''}</span></div>`).join('');
    const alerts = (d.alerts || []).map((a) => `<div class="note ${a.kind || 'info'}">${a.title ? `<b>${esc(a.title)}</b>` : ''}<span>${a.html || esc(a.text)}</span></div>`).join('');

    const items = d.items.map((it) => {
      let cls = '';
      if (isToday && it.time && /^\d\d:\d\d$/.test(it.time)) {
        const endT = it.end && /^\d\d:\d\d$/.test(it.end) ? it.end : it.time;
        if (endT < now) cls = ' is-past';
        else if (!nextMarked) { cls = ' is-next'; nextMarked = true; }
      }
      const places = (it.places || []).map((pid) => {
        const p = P(pid); if (!p) return '';
        return `<div class="place-row"><span class="nm">${esc(p.name)}<small class="vn">${esc(p.vn || '')}${p.hours ? ' · ' + esc(p.hours) : ''}${p.price ? ' · ' + esc(p.price) : ''}</small></span>${placeButtons(pid, it.mode)}</div>`;
      }).join('');
      const food = (it.food || []).map((fid) => T.food.find((f) => f.id === fid)).filter(Boolean)
        .map((f) => `<a class="btn ghost" href="${gmSearch(f.q || f.vn + ', ' + f.addr)}" target="_blank" rel="noopener">${icon('bowl')}${esc(f.name)}</a>`).join('');
      return `<li class="tl${cls}" data-type="${esc(it.type)}">
        <div class="time">${esc(it.time || '')}${it.end ? `<small>→ ${esc(it.end)}</small>` : ''}${it.timeNote ? `<small>${esc(it.timeNote)}</small>` : ''}</div>
        <div class="rail"><span class="dot">${icon(it.type)}</span></div>
        <div class="body"><div class="box">
          <div class="row">${badge(it.status)}${it.unverified ? badge('unverified') : ''}</div>
          <h3>${esc(it.title)}</h3>
          ${it.desc ? `<p>${it.descHtml ? it.desc : esc(it.desc)}</p>` : ''}
          ${it.tip ? `<div class="tip"><b>交通・提示</b>　${esc(it.tip)}</div>` : ''}
          ${places ? `<div class="places">${places}</div>` : ''}
          ${food ? `<div class="row">${food}</div>` : ''}
        </div></div>
      </li>`;
    }).join('');

    const routeStops = (d.route && d.route.stops || []).map(P).filter(Boolean);
    const routeBtn = routeStops.length > 1
      ? `<a class="btn primary" href="${gmRoute(routeStops.map(placeQ), d.route.mode)}" target="_blank" rel="noopener">${icon('route')}在 Google 地圖開啟本日路線</a>` : '';

    const dayFood = (d.food || []).map((fid) => T.food.find((f) => f.id === fid)).filter(Boolean);
    const foodBlock = dayFood.length ? `<div class="card stack"><div class="sec-title"><h2 style="font-size:18px">本日餐飲建議</h2><small>非預約・營業時間以現場為準</small></div>
      ${dayFood.map((f) => `<div class="place-row"><span class="nm">${esc(f.name)}${f.michelin ? ' <span class="badge b-michelin">' + esc(f.michelin) + '</span>' : ''}<small>${esc(f.dish || '')}${f.price ? ' · ' + esc(f.price) : ''}</small></span>
      <div class="acts"><a class="btn" href="${gmSearch(f.q || f.vn + ', ' + f.addr)}" target="_blank" rel="noopener">${icon('pin')}地圖</a><a class="btn" href="${gmNav(f.q || f.vn + ', ' + f.addr, 'walking')}" target="_blank" rel="noopener">${icon('nav')}導航</a></div></div>`).join('')}
    </div>` : '';

    const planB = d.planB ? `<div class="note info"><b>備案／彈性調整</b><span>${esc(d.planB)}</span></div>` : '';

    return `${heroHTML()}<div class="wrap"><section data-view="itinerary" aria-label="每日行程">
      <nav class="days" aria-label="選擇日期">${chips}</nav>
      <header class="day-head">
        <div class="eyebrow">第 <b>${T.days.indexOf(d) + 1}</b> 天 · ${esc(d.date.replace(/-/g, '.'))}（週${esc(d.dow)}） · ${esc(d.city)}</div>
        <h2>${esc(d.title)}</h2>
        ${d.lead ? `<p class="lead">${esc(d.lead)}</p>` : ''}
      </header>
      ${facts ? `<div class="facts">${facts}</div>` : ''}
      ${alerts}
      ${routeBtn ? `<div class="row">${routeBtn}</div>` : ''}
      <ol class="timeline">${items}</ol>
      ${planB}
      ${foodBlock}
      <div class="legend" aria-label="圖例">${['booked', 'confirm', 'todo', 'suggest', 'unverified'].map((s) => badge(s)).join('')}</div>
      <p class="small muted">時間為建議安排（越南當地時間 UTC+7，比台灣慢 1 小時）。標示「已訂」者才是確定的預訂；其餘為建議，出發前請以官方或訂位平台為準。</p>
    </section></div>`;
  }

  /* ---------- 地圖 ---------- */
  const REGIONS = { all: '全部', hanoi: '河內', sapa: '沙壩', ninhbinh: '寧平', transit: '交通節點' };

  function projector(pts, W, H, pad) {
    const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
    let minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    let w = (maxLng - minLng) * k || 0.01, h = (maxLat - minLat) || 0.01;
    const s = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
    const ox = (W - w * s) / 2, oy = (H - h * s) / 2;
    return {
      x: (lng) => ox + (lng - minLng) * k * s,
      y: (lat) => oy + (maxLat - lat) * s,
      kmPerPx: (111.32) / s, // 每像素公里數（緯度方向）
    };
  }

  function scaleBar(pr, W, H) {
    const targets = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
    const km = targets.find((t) => t / pr.kmPerPx > 50) || 100;
    const px = km / pr.kmPerPx;
    const x0 = 14, y0 = H - 14;
    return `<g class="scale"><line x1="${x0}" y1="${y0}" x2="${x0 + px}" y2="${y0}" stroke="var(--ink-2)" stroke-width="2"/>
      <line x1="${x0}" y1="${y0 - 4}" x2="${x0}" y2="${y0 + 1}" stroke="var(--ink-2)" stroke-width="2"/><line x1="${x0 + px}" y1="${y0 - 4}" x2="${x0 + px}" y2="${y0 + 1}" stroke="var(--ink-2)" stroke-width="2"/>
      <text x="${x0 + px / 2}" y="${y0 - 6}" text-anchor="middle" font-size="10" fill="var(--ink-2)">${km < 1 ? km * 1000 + ' m' : km + ' km'}</text></g>
      <g transform="translate(${W - 22},22)"><path d="M0 -12 L5 4 L0 1 L-5 4 Z" fill="var(--ink-2)"/><text y="16" text-anchor="middle" font-size="10" fill="var(--ink-2)">N</text></g>`;
  }

  function overviewSVG() {
    const O = T.overview; const W = 360, H = 300;
    const pr = projector(O.nodes, W, H, 38);
    const node = (id) => O.nodes.find((n) => n.id === id);
    const color = { train: 'var(--gold)', bus: 'var(--todo)', car: 'var(--terrace)', flight: 'var(--accent)' };
    const dash = { train: '', bus: '6 4', car: '2 4', flight: '1 5' };
    const links = O.links.map((l, i) => {
      const a = node(l.from), b = node(l.to);
      const x1 = pr.x(a.lng), y1 = pr.y(a.lat), x2 = pr.x(b.lng), y2 = pr.y(b.lat);
      const mx = (x1 + x2) / 2 + (l.bend || 0), my = (y1 + y2) / 2 + (l.bendY || 0);
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${color[l.kind]}" stroke-width="3" stroke-dasharray="${dash[l.kind]}" stroke-linecap="round"/>`;
    }).join('');
    const nodes = O.nodes.map((n) => {
      const x = pr.x(n.lng), y = pr.y(n.lat);
      const anchor = n.anchor || 'start'; const dx = anchor === 'end' ? -9 : anchor === 'middle' ? 0 : 9; const dy = n.dy || 4;
      return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${n.major ? 6 : 4.5}" fill="${n.major ? 'var(--band)' : 'var(--surface)'}" stroke="var(--band)" stroke-width="2"/>
        <text x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}" font-size="12" font-weight="700" fill="var(--ink)">${esc(n.label)}</text>
        ${n.sub ? `<text x="${(x + dx).toFixed(1)}" y="${(y + dy + 13).toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="var(--ink-3)">${esc(n.sub)}</text>` : ''}</g>`;
    }).join('');
    const rivers = (O.rivers || []).map((r) => {
      const pts = r.pts.map(([la, ln]) => `${pr.x(ln).toFixed(1)},${pr.y(la).toFixed(1)}`).join(' ');
      const [la, ln] = r.pts[r.labelAt || 0];
      return `<polyline points="${pts}" fill="none" stroke="var(--river)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>
        <text x="${(pr.x(ln) + 8).toFixed(1)}" y="${(pr.y(la) + 14).toFixed(1)}" font-size="10" fill="var(--ink-3)">${esc(r.name)}</text>`;
    }).join('');
    const labels = (O.labels || []).map((l) => `<text x="${pr.x(l.lng).toFixed(1)}" y="${pr.y(l.lat).toFixed(1)}" font-size="10" letter-spacing="2" fill="var(--ink-3)" text-anchor="${l.anchor || 'start'}">${esc(l.text)}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="行程路線示意圖：依真實經緯度比例繪製">
      <rect x="0" y="0" width="${W}" height="${H}" fill="var(--surface)"/>${rivers}${labels}${links}${nodes}${scaleBar(pr, W, H)}</svg>`;
  }

  function regionSVG(list) {
    const pts = list.filter((x) => typeof x.p.lat === 'number');
    if (pts.length < 2) return '';
    const W = 360, H = 260;
    const pr = projector(pts.map((x) => x.p), W, H, 26);
    const dots = pts.map((x) => {
      const cx = pr.x(x.p.lng), cy = pr.y(x.p.lat);
      return `<g><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="10" fill="var(--band)" stroke="var(--surface)" stroke-width="2"/>
        <text x="${cx.toFixed(1)}" y="${(cy + 3.6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--on-band)">${x.n}</text></g>`;
    }).join('');
    const grid = Array.from({ length: 7 }, (_, i) => `<line x1="${(i + 1) * W / 8}" y1="0" x2="${(i + 1) * W / 8}" y2="${H}" stroke="var(--line)" stroke-width=".6"/>`).join('')
      + Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${(i + 1) * H / 6}" x2="${W}" y2="${(i + 1) * H / 6}" stroke="var(--line)" stroke-width=".6"/>`).join('');
    return `<div class="mapbox"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="地點相對位置圖（依經緯度比例，非街道地圖）"><rect width="${W}" height="${H}" fill="var(--surface)"/>${grid}${dots}${scaleBar(pr, W, H)}</svg>
      <div class="map-legend"><span>號碼對應下方清單・依經緯度比例繪製的相對位置，非街道地圖；實際路線請按「導航」。</span></div></div>`;
  }

  function renderMap() {
    const seg = Object.keys(REGIONS).map((k) => `<button type="button" data-region="${k}" aria-pressed="${mapRegion === k}">${REGIONS[k]}</button>`).join('');
    const entries = Object.entries(T.places).filter(([, p]) => !p.hidden && (mapRegion === 'all' || p.region === mapRegion));
    const list = entries.map(([id, p], i) => ({ id, p, n: i + 1 }));
    const cards = list.map(({ id, p, n }) => `<div class="card pcard"><span class="n">${n}</span><div class="stack" style="gap:6px;min-width:0">
      <div class="row" style="justify-content:space-between"><h3>${esc(p.name)}</h3>${p.status ? badge(p.status) : ''}${p.unverified ? badge('unverified') : ''}</div>
      <div class="meta"><span class="vn">${esc(p.vn || '')}</span>${p.addr ? `<span class="vn">${esc(p.addr)}</span>` : ''}${p.hours ? `<span>時間：${esc(p.hours)}</span>` : ''}${p.price ? `<span>票價：${esc(p.price)}</span>` : ''}${p.days ? `<span>行程：${esc(p.days)}</span>` : ''}</div>
      ${p.note ? `<p class="small muted">${esc(p.note)}</p>` : ''}
      ${placeButtons(id)}
      ${p.src && p.src.length ? `<details class="more"><summary>資料來源</summary><div class="src">${p.src.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join('<br>')}</div></details>` : ''}
    </div></div>`).join('');
    return `<div class="wrap"><section data-view="map" aria-label="地圖與導航">
      <div class="sec-title"><h2>路線總覽</h2><small>依經緯度比例繪製</small></div>
      <div class="mapbox">${overviewSVG()}
        <div class="map-legend"><span><i style="border-color:var(--accent);border-top-style:dotted"></i>航班</span><span><i style="border-color:var(--gold)"></i>夜車（11/3）</span><span><i style="border-color:var(--todo);border-top-style:dashed"></i>夜巴（11/8，待訂）</span><span><i style="border-color:var(--terrace);border-top-style:dotted"></i>接駁／包車</span></div>
      </div>
      ${(T.overview.legs || []).length ? `<div class="card stack small">${T.overview.legs.map((l) => `<div><b>${esc(l.k)}</b>　<span class="muted">${esc(l.v)}</span></div>`).join('')}</div>` : ''}
      <div class="sec-title"><h2>景點與地點</h2><small>${list.length} 處</small></div>
      <div class="seg" role="group" aria-label="篩選區域">${seg}</div>
      ${mapRegion !== 'all' ? regionSVG(list) : ''}
      <div class="plist">${cards}</div>
      <p class="small muted">建議出發前在 Google 地圖下載「河內」「沙壩」「寧平」離線地圖；沙壩山區步道訊號不穩。</p>
    </section></div>`;
  }

  /* ---------- 美食 ---------- */
  const FREG = { hanoi: '河內', sapa: '沙壩', ninhbinh: '寧平' };
  function renderFood() {
    const seg = Object.keys(FREG).map((k) => `<button type="button" data-fregion="${k}" aria-pressed="${foodRegion === k}">${FREG[k]}</button>`).join('');
    const dishes = T.dishes.filter((x) => x.region === foodRegion).map((x, i) => `<button type="button" class="dish" data-show-dish="${esc(foodRegion)}:${i}">
      <span class="vn">${esc(x.vn)}</span><span class="zh">${esc(x.zh)}</span><p>${esc(x.desc)}</p></button>`).join('');
    const rests = T.food.filter((f) => f.region === foodRegion).map((f) => `<article class="card rest stack" style="gap:8px">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><div style="min-width:0"><h3 class="vn">${esc(f.vn)}</h3><div class="small muted">${esc(f.name)}</div></div>
      <div class="row">${f.michelin ? `<span class="badge b-michelin">${esc(f.michelin)}</span>` : ''}${badge(f.status || 'suggest')}${f.unverified ? badge('unverified') : ''}</div></div>
      <p class="dishline">${esc(f.dish)}</p>
      <dl class="kv"><dt>地址</dt><dd class="vn">${esc(f.addr)}</dd>${f.hours ? `<dt>時間</dt><dd>${esc(f.hours)}</dd>` : ''}${f.price ? `<dt>價位</dt><dd>${esc(f.price)}</dd>` : ''}${f.day ? `<dt>搭配</dt><dd>${esc(f.day)}</dd>` : ''}</dl>
      ${f.note ? `<p class="small muted">${esc(f.note)}</p>` : ''}
      <div class="acts row"><a class="btn" href="${gmSearch(f.q || f.vn + ', ' + f.addr)}" target="_blank" rel="noopener">${icon('pin')}地圖</a><a class="btn" href="${gmNav(f.q || f.vn + ', ' + f.addr, 'walking')}" target="_blank" rel="noopener">${icon('nav')}導航</a></div>
      ${f.src && f.src.length ? `<details class="more"><summary>資料來源</summary><div class="src">${f.src.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join('<br>')}</div></details>` : ''}
    </article>`).join('');
    return `<div class="wrap"><section data-view="food" aria-label="餐飲推薦">
      <div class="sec-title"><h2>吃什麼</h2><small>點菜卡可全螢幕給店家看</small></div>
      <div class="seg" role="group" aria-label="篩選城市">${seg}</div>
      <div class="eyebrow">必吃特色</div>
      <div class="dish-grid">${dishes}</div>
      <div class="eyebrow">推薦店家</div>
      <div class="stack">${rests || '<p class="muted">此區以現場選擇為主。</p>'}</div>
      ${T.foodNotes && T.foodNotes[foodRegion] ? `<div class="note info">${esc(T.foodNotes[foodRegion])}</div>` : ''}
    </section></div>`;
  }

  /* ---------- 預訂與預算 ---------- */
  function renderBook() {
    const counts = ['booked', 'confirm', 'todo', 'suggest'].map((s) => `<div><b class="num" style="color:var(--${{ booked: 'ok', confirm: 'warn', todo: 'todo', suggest: 'sug' }[s]})">${T.bookings.filter((b) => b.status === s).length}</b><span>${STATUS[s]}</span></div>`).join('');
    const bks = T.bookings.map((b) => `<article class="card bk st-${b.status}">
      <div class="bk-top"><div style="min-width:0"><div class="when">${esc(b.when)}・${esc(b.type)}</div><h3>${esc(b.title)}</h3></div>${badge(b.status)}</div>
      ${b.detail ? `<p class="small muted">${esc(b.detail)}</p>` : ''}
      ${b.next ? `<div class="next"><b>${b.status === 'booked' ? '提醒' : '待辦'}</b>　${esc(b.next)}</div>` : ''}
      ${b.place ? placeButtons(b.place) : ''}
    </article>`).join('');
    const stays = T.stays.map((s) => `<article class="card stack" style="gap:8px">
      <div class="bk-top"><div style="min-width:0"><div class="when">${esc(s.dates)}</div><h3>${esc(s.name)}</h3></div>${badge(s.status)}</div>
      <dl class="kv">${s.addr ? `<dt>地址</dt><dd class="vn">${esc(s.addr)}</dd>` : ''}${s.inout ? `<dt>入退</dt><dd>${esc(s.inout)}</dd>` : ''}${s.area ? `<dt>位置</dt><dd>${esc(s.area)}</dd>` : ''}</dl>
      ${s.note ? `<p class="small muted">${esc(s.note)}</p>` : ''}
      ${s.unverified ? `<div class="row">${badge('unverified')}<span class="small muted">${esc(s.unverifiedNote || '地址請以訂房確認信為準')}</span></div>` : ''}
      ${s.place ? placeButtons(s.place) : ''}
    </article>`).join('');
    return `<div class="wrap"><section data-view="book" aria-label="訂位與預算">
      <div class="sec-title"><h2>訂位狀態</h2><small>不顯示票號與訂位代碼</small></div>
      <div class="summary">${counts}</div>
      <div class="stack">${bks}</div>
      <div class="sec-title"><h2>住宿</h2></div>
      <div class="stack">${stays}</div>
      <div class="sec-title"><h2>預算估算</h2><small>每人・可自填實際花費</small></div>
      ${budgetHTML()}
    </section></div>`;
  }

  function budgetHTML() {
    const rate = store.get('rate', T.meta.rate.vndPerTwd);
    const pax = store.get('pax', 2);
    const actual = store.get('actual', {});
    const twd = (v) => Math.round(v / rate);
    const fmt = (n) => n.toLocaleString('zh-TW');
    let lo = 0, hi = 0, act = 0;
    const rows = T.budget.map((b) => {
      const mult = b.per === 'group' ? 1 : pax;
      const l = b.low != null ? b.low * mult : null, h = b.high != null ? b.high * mult : null;
      if (l != null) lo += l; if (h != null) hi += h;
      const a = Number(actual[b.id]) || 0; act += a;
      return `<tr><td><b>${esc(b.item)}</b><br><span class="small muted">${esc(b.note || '')}</span></td><td>${badge(b.status)}</td>
        <td class="r">${l != null ? fmt(twd(l)) + '–' + fmt(twd(h)) : '—'}<br><span class="small muted">${l != null ? (b.per === 'group' ? '整團' : '×' + pax + ' 人') : '自填'}</span></td>
        <td class="r"><input id="act-${esc(b.id)}" data-actual="${esc(b.id)}" inputmode="numeric" value="${a || ''}" placeholder="NT$" aria-label="${esc(b.item)} 實際花費（新台幣）"></td></tr>`;
    }).join('');
    return `<div class="card stack">
      <div class="conv two" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="small">人數<input id="pax" type="number" min="1" max="8" value="${pax}" style="font-size:16px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)"></label>
        <label class="small">匯率（1 TWD = ? VND）<input id="rate-b" type="number" step="1" value="${rate}" style="font-size:16px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)"></label>
      </div>
      <div class="tablewrap"><table class="budget"><thead><tr><th>項目</th><th>狀態</th><th class="r">估算 NT$</th><th class="r">實際 NT$</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>合計（不含已付機票住宿時請自填）</td><td></td><td class="r" id="b-est">${fmt(twd(lo))}–${fmt(twd(hi))}</td><td class="r" id="b-act">${fmt(act)}</td></tr></tfoot></table></div>
      <p class="small muted">${esc(T.meta.rate.note)}</p>
    </div>`;
  }

  /* ---------- 行前準備 ---------- */
  function renderPrep() {
    const done = store.get('check', {});
    const all = T.checklist.flatMap((g) => g.items);
    const n = all.filter((i) => done[i.id]).length;
    const groups = T.checklist.map((g) => `<div class="check-group"><h3>${esc(g.group)}</h3>
      ${g.items.map((i) => `<label class="chk${done[i.id] ? ' done' : ''}" for="ck-${esc(i.id)}"><input type="checkbox" id="ck-${esc(i.id)}" data-check="${esc(i.id)}" ${done[i.id] ? 'checked' : ''}>
      <span class="t">${esc(i.text)}${i.critical ? badge('todo', '重要') : ''}<small>${esc(i.note || '')}</small></span></label>`).join('')}</div>`).join('');
    const rate = store.get('rate', T.meta.rate.vndPerTwd);
    const tips = T.tips.map((t) => `<details class="card more" style="border-top:0;padding:14px 16px"><summary style="font-size:15px">${esc(t.title)}</summary>
      <ul style="margin:10px 0 0;padding-left:18px;display:grid;gap:6px;font-size:14px">${t.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${t.src ? `<div class="src" style="margin-top:8px">來源：${t.src.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join('、')}</div>` : ''}</details>`).join('');
    const contacts = T.contacts.map((c) => `<div class="contact"><div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b>${c.unverified ? badge('unverified') : ''}</div>
      <div class="row"><span class="num">${esc(c.num)}</span><button class="btn ghost" type="button" data-copy="${esc(c.num)}">${icon('copy')}複製</button></div>
      ${c.note ? `<span class="small muted">${esc(c.note)}</span>` : ''}</div>`).join('');
    const phrases = T.phrases.map((p, i) => `<div class="phr"><div style="min-width:0"><div class="vn">${esc(p.vn)}</div><div class="zh">${esc(p.zh)}</div></div>
      <button class="btn ghost" type="button" data-show-phrase="${i}" aria-label="全螢幕顯示">${icon('show')}</button></div>`).join('');
    return `<div class="wrap"><section data-view="prep" aria-label="行前準備">
      <div class="sec-title"><h2>行前清單</h2><small class="num">${n} / ${all.length} 完成</small></div>
      <div class="progress" aria-hidden="true"><i style="width:${Math.round((n / all.length) * 100)}%"></i></div>
      <div class="card">${groups}
        <div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn ghost" type="button" id="reset-check">清除勾選</button></div>
        <div id="reset-confirm" class="note warn" hidden><span>確定清除全部勾選？</span><div class="row"><button class="btn" type="button" id="reset-yes">清除</button><button class="btn ghost" type="button" id="reset-no">取消</button></div></div>
      </div>
      <div class="sec-title"><h2>匯率換算</h2><small>可自行修改匯率</small></div>
      <div class="card conv">
        <label>1 新台幣 = ? 越南盾<input id="rate" type="number" inputmode="decimal" value="${rate}"></label>
        <div class="two"><label>越南盾 VND<input id="vnd" type="text" inputmode="numeric" value="100,000"></label><label>新台幣 TWD<input id="twd" type="text" inputmode="decimal" value=""></label></div>
        <div class="row">${[10000, 30000, 50000, 100000, 200000, 500000].map((v) => `<button class="btn" type="button" data-vnd="${v}">${(v / 1000).toLocaleString()}k</button>`).join('')}</div>
        <p class="small muted">越南盾面額大，價格常寫成「50k」= 50,000 VND。${esc(T.meta.rate.note)}</p>
      </div>
      <div class="sec-title"><h2>注意事項</h2></div>
      <div class="stack">${tips}</div>
      <div class="sec-title"><h2>緊急聯絡</h2></div>
      <div class="card">${contacts}</div>
      <div class="sec-title"><h2>實用越南語</h2><small>點右側可全螢幕出示</small></div>
      <div class="card">${phrases}</div>
      <div class="sec-title"><h2>安裝到手機</h2></div>
      <div class="card stack small" id="install-box">
        <p>把這個網站加到主畫面，就能像 App 一樣開啟，第一次開啟後可離線瀏覽（Google 地圖連結仍需網路）。</p>
        <p><b>iPhone（Safari）</b>：分享 →「加入主畫面」。<br><b>Android（Chrome）</b>：選單 →「安裝應用程式」或「加到主畫面」。</p>
        <button class="btn primary" type="button" id="install-btn" hidden>${icon('show')}安裝北越十日</button>
        <p id="sw-status" class="muted"></p>
      </div>
    </section></div>`;
  }

  /* ---------- 全螢幕出示卡 ---------- */
  const showEl = $('#show');
  function showCard(big, sub, hint) {
    $('.big', showEl).textContent = big;
    $('.sub', showEl).textContent = sub || '';
    $('.hint', showEl).textContent = hint || '';
    showEl.hidden = false;
    $('#show-close').focus();
  }
  function closeCard() { showEl.hidden = true; }

  /* ---------- 渲染與路由 ---------- */
  const VIEWS = { itinerary: renderItinerary, map: renderMap, food: renderFood, book: renderBook, prep: renderPrep };
  function render(scrollTop) {
    app.innerHTML = VIEWS[view]();
    $$('.tabbar a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === view ? 'page' : 'false'));
    if (view === 'itinerary') {
      const chip = $(`.day-chip[aria-pressed="true"]`);
      if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    if (view === 'prep') { convFrom('vnd'); updateInstallUI(); }
    if (scrollTop) window.scrollTo(0, 0);
  }

  function route() {
    const h = (location.hash || '').slice(1);
    if (h === 'today' || h === '' || h === 'itinerary') {
      view = 'itinerary';
      const td = todayDay();
      if (h === 'today' || (!h && td)) currentDay = (td || T.days[0]).id;
    } else if (/^day-\d{4}$/.test(h) && T.days.some((d) => d.id === h.slice(4))) {
      view = 'itinerary'; currentDay = h.slice(4);
    } else if (VIEWS[h]) view = h;
    render(true);
  }
  window.addEventListener('hashchange', route);

  /* ---------- 事件 ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.day) { currentDay = t.dataset.day; history.replaceState(null, '', '#day-' + currentDay); render(false); window.scrollTo({ top: Math.max(0, $('.days').offsetTop - 70) }); return; }
    if (t.dataset.region) { mapRegion = t.dataset.region; render(false); return; }
    if (t.dataset.fregion) { foodRegion = t.dataset.fregion; render(false); return; }
    if (t.dataset.showPlace) {
      const p = P(t.dataset.showPlace);
      showCard(`${p.vn || p.name}\n${p.addr || ''}`, p.name, 'Làm ơn chở tôi đến địa chỉ này.（請載我到這個地址）');
      return;
    }
    if (t.dataset.showDish) {
      const [r, i] = t.dataset.showDish.split(':');
      const d = T.dishes.filter((x) => x.region === r)[Number(i)];
      showCard(d.vn, d.zh, 'Cho tôi món này.（我要點這道菜）');
      return;
    }
    if (t.dataset.showPhrase) { const p = T.phrases[Number(t.dataset.showPhrase)]; showCard(p.vn, p.zh, ''); return; }
    if (t.id === 'show-close') { closeCard(); return; }
    if (t.dataset.copy) {
      const v = t.dataset.copy;
      const ok = () => toast('已複製 ' + v);
      try { navigator.clipboard.writeText(v).then(ok, () => toast('無法自動複製，請長按號碼選取')); } catch (err) { toast('無法自動複製，請長按號碼選取'); }
      return;
    }
    if (t.dataset.vnd) { $('#vnd').value = Number(t.dataset.vnd).toLocaleString('en-US'); convFrom('vnd'); return; }
    if (t.id === 'reset-check') { $('#reset-confirm').hidden = false; return; }
    if (t.id === 'reset-no') { $('#reset-confirm').hidden = true; return; }
    if (t.id === 'reset-yes') { store.set('check', {}); render(false); toast('已清除勾選'); return; }
    if (t.id === 'install-btn' && deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; updateInstallUI(); }); return; }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !showEl.hidden) closeCard(); });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.check) {
      const done = store.get('check', {});
      if (t.checked) done[t.dataset.check] = true; else delete done[t.dataset.check];
      store.set('check', done);
      t.closest('.chk').classList.toggle('done', t.checked);
      const all = T.checklist.flatMap((g) => g.items); const n = all.filter((i) => done[i.id]).length;
      $('.sec-title small.num').textContent = `${n} / ${all.length} 完成`;
      $('.progress i').style.width = Math.round((n / all.length) * 100) + '%';
    }
    if (t.id === 'pax') { store.set('pax', Math.max(1, Math.min(8, Number(t.value) || 1))); render(false); }
    if (t.id === 'rate-b') { const r = Number(t.value); if (r > 0) store.set('rate', r); render(false); }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'rate') { const r = Number(t.value); if (r > 0) { store.set('rate', r); convFrom('vnd'); } }
    if (t.id === 'vnd') convFrom('vnd');
    if (t.id === 'twd') convFrom('twd');
    if (t.dataset.actual) {
      const a = store.get('actual', {}); const v = Number(String(t.value).replace(/[^\d.]/g, ''));
      if (v > 0) a[t.dataset.actual] = v; else delete a[t.dataset.actual];
      store.set('actual', a);
      const sum = Object.values(a).reduce((s, x) => s + Number(x || 0), 0);
      const el = $('#b-act'); if (el) el.textContent = sum.toLocaleString('zh-TW');
    }
  });

  function convFrom(which) {
    const rateEl = $('#rate'); if (!rateEl) return;
    const rate = Number(rateEl.value) || T.meta.rate.vndPerTwd;
    const num = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;
    if (which === 'vnd') { const v = num($('#vnd').value); $('#twd').value = v ? (v / rate).toFixed(v / rate < 100 ? 1 : 0) : ''; }
    else { const v = num($('#twd').value); $('#vnd').value = v ? Math.round(v * rate).toLocaleString('en-US') : ''; }
  }

  let toastTimer;
  function toast(msg, actionLabel, action) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
    if (actionLabel) $('button', el).onclick = action;
    el.hidden = false;
    clearTimeout(toastTimer);
    if (!actionLabel) toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------- 網路狀態 ---------- */
  function netUI() { const el = $('#net'); if (el) el.hidden = navigator.onLine !== false; }
  window.addEventListener('online', netUI); window.addEventListener('offline', netUI);

  /* ---------- PWA：安裝與離線 ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; updateInstallUI(); });
  function updateInstallUI() {
    const btn = $('#install-btn'); if (btn) btn.hidden = !deferredPrompt;
    const st = $('#sw-status'); if (!st) return;
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    const ctrl = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    const can = 'serviceWorker' in navigator && /^https?:$/.test(location.protocol);
    st.textContent = (standalone ? '目前以 App 模式開啟。' : '') + (ctrl ? '離線快取已啟用。' : can ? '離線快取準備中，重新開啟一次後即可離線瀏覽。' : '目前的開啟方式不支援離線快取；部署到 https 網址後即可安裝與離線使用。');
  }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(() => updateInstallUI()).catch(() => { /* 不支援時照常運作 */ });
    });
  }

  netUI();
  route();
})();
