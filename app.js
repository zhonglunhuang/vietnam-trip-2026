/* 北越十日 2026 — 互動與同步
   資料流：data.js 內建一份快照 → 有設定 Google Sheet API 時改用上次同步的內容 → 連上網路再抓最新的。
   勾清單、記帳先存在手機（overlay），再排進 outbox，有網路且有寫入密碼時依序寫回 Sheet。 */
(function () {
  'use strict';
  const D = window.TRIP_DATA;
  const CFG = window.TRIP_CONFIG || {};
  const S = window.TripSheet;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('zh-TW');
  /* 試算表來的網址只接受 http(s)，其餘（javascript: 等）一律換成 # */
  const safeUrl = (u) => S.httpUrl(u) || '#';
  const extLink = (u, text) => S.httpUrl(u) ? `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text);

  /* ---------- 本機儲存（可能被封鎖，一律 try/catch） ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bv10.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bv10.' + k, JSON.stringify(v)); } catch (e) { /* 無法儲存時照常運作 */ } },
    del(k) { try { localStorage.removeItem('bv10.' + k); } catch (e) { /* 同上 */ } },
  };

  /* ---------- 圖示 ---------- */
  const ICON = {
    flight: '<path d="M10.5 13.5 3 11l1.5-1.5 8 1 4-4c.8-.8 2.2-.8 2.5 0 .3.4.2 1.3-.5 2l-4 4 1 8L14 22l-2.5-7.5-3 3V20l-1.5 1-1-3-3-1 1-1.5h2.5z"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l-2-4M15 21l2-4M9 14h.01M15 14h.01"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 10h16M7 21v-3M17 21v-3M8 14h.01M16 14h.01"/>',
    car: '<path d="M5 17h14v-5l-2-5H7l-2 5zM5 12h14"/><circle cx="8" cy="17" r="1.8"/><circle cx="16" cy="17" r="1.8"/>',
    boat: '<path d="M3 15h18l-3 5H6zM12 15V4l6 9"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    nav: '<path d="m3 11 18-8-8 18-2-8z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    show: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 0 4v5h18v-5a2 2 0 0 1 0-4V3H3zM14 3v14"/>',
    warn: '<path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01"/>',
    todo: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M4 4v4h4M20 20v-4h-4"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ICON.info}</svg>`;

  const STATUS = { booked: '已訂', confirm: '待確認', todo: '待訂', suggest: '建議' };
  const TYPE = S.ENUMS.type;
  const MOVE = ['flight', 'train', 'bus', 'car', 'boat'];
  const REGION_VN = { hanoi: 'Hà Nội', sapa: 'Sa Pa', ninhbinh: 'Ninh Bình', transit: 'Việt Nam' };
  const REGION_ZH = S.ENUMS.region;
  const CAT = S.ENUMS.category;
  const chip = (s, label) => s ? `<span class="chip st-${STATUS[s] ? s : 'other'}">${esc(label || STATUS[s] || s)}</span>` : '';
  const regionVar = (r) => `var(--${REGION_ZH[r] ? r : 'transit'})`;
  const unv = (on) => on ? '<span class="chip st-unverified">資訊未確認</span>' : '';

  /* ---------- 資料與同步狀態 ---------- */
  const apiUrl = () => (store.get('api', '') || CFG.sheetApi || '').trim();
  const writeKey = () => store.get('key', '');

  function build(tables) {
    const trip = S.tablesToTrip(tables, { overview: D.overview });
    const checks = store.get('checks', {});
    for (const g of trip.checklist) for (const i of g.items) if (i.id in checks) { i.done = checks[i.id]; i.pending = true; }
    const local = store.get('expLocal', []);
    const gone = store.get('expDel', []);
    trip.expenses = trip.expenses.filter((e) => !gone.includes(e.id))
      .concat(local.filter((e) => !trip.expenses.some((x) => x.id === e.id)).map((e) => Object.assign({}, e, { pending: true })));
    return trip;
  }
  /* 試算表內容不能用（沒有任何一天、或轉換時出錯）就回傳 null，呼叫的地方改用內建資料 */
  function buildChecked(tables) {
    try { const t = build(tables); return t.days.length ? t : null; } catch (e) { return null; }
  }
  const cached = apiUrl() ? store.get('sheet', null) : null;
  let base = cached && typeof cached === 'object' && cached.tables && typeof cached.tables === 'object' ? cached : null;
  let TRIP = base ? buildChecked(base.tables) : null;
  if (!TRIP) { if (cached) store.del('sheet'); base = null; TRIP = build(D.tables); }
  /* error：讀取的問題；writeError：寫回的問題（直到下一次寫回成功才清掉） */
  const sync = { source: base ? 'cache' : 'bundled', generated: base ? base.generated : D.generated, error: '', writeError: '', busy: false };
  let flushing = false;   // flush() 執行中
  let inflight = '';      // 正在送出的 opId
  let ackSeq = 0;         // 每寫回成功一筆 +1；pull() 用來判斷讀到的快照是不是比寫回更舊
  let repull = false;     // pull() 時剛好在寫回，等寫完再讀一次
  let lastPull = 0;
  let keyRejected = null; // 被伺服器拒絕的寫入密碼；換密碼或測試成功前不再自動重送

  const rate = () => Number(store.get('rate', 0)) || TRIP.meta.rate.vndPerTwd || 800;
  const P = (id) => TRIP.places[id];
  const F = (id) => TRIP.food.find((f) => f.id === id);
  const dayById = (id) => TRIP.days.find((d) => d.id === id) || TRIP.days[0];

  /* ---------- 照片 ---------- */
  function photoInfo(key) {
    const p = key && TRIP.photos[key];
    const url = p && S.httpUrl(p.url);
    if (!p || (!p.file && !url)) return null;
    if (url) return Object.assign({}, p, { src: url, srcset: '' });
    return Object.assign({}, p, { src: `img/${p.file}-600.webp`, srcset: `img/${p.file}-600.webp 600w, img/${p.file}-1200.webp 1200w` });
  }
  const FOCAL = { top: '50% 22%', bottom: '50% 78%', center: '50% 50%' };
  function ph(key, o = {}) {
    const p = photoInfo(key);
    const cls = `ph ${o.cls || ''}`;
    if (!p) return `<div class="${cls} noimg" data-fallback="${esc(o.fallback || '')}">${o.extra || ''}</div>`;
    return `<div class="${cls}" data-fallback="${esc(o.fallback || '')}"><img src="${esc(p.src)}"${p.srcset ? ` srcset="${esc(p.srcset)}" sizes="${esc(o.sizes || '(max-width: 720px) 100vw, 720px')}"` : ''} alt="${esc(p.alt || o.fallback || '')}" loading="${o.eager ? 'eager' : 'lazy'}" decoding="async" style="object-position:${FOCAL[p.focal] || FOCAL.center}" onerror="this.parentNode.classList.add('noimg')">${o.extra || ''}</div>`;
  }
  const creditText = (key) => { const p = TRIP.photos[key]; return p && p.credit ? `攝影 ${p.credit}／${p.license || ''}` : ''; };

  /* ---------- Google Maps ---------- */
  const gmSearch = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  const gmNav = (q, mode) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}${mode ? '&travelmode=' + mode : ''}`;
  function gmRoute(qs, mode) {
    if (qs.length < 2) return gmSearch(qs[0]);
    const p = new URLSearchParams({ api: '1', origin: qs[0], destination: qs[qs.length - 1] });
    if (qs.length > 2) p.set('waypoints', qs.slice(1, -1).join('|'));
    if (mode) p.set('travelmode', mode);
    return 'https://www.google.com/maps/dir/?' + p.toString();
  }
  const placeQ = (p) => p.q || [p.vn || p.name, p.addr].filter(Boolean).join(', ');
  const foodQ = (f) => f.q || [f.vn, f.addr].filter(Boolean).join(', ');
  const linkBtn = (href, ic, label, cls = '') => `<a class="btn ${cls}" href="${esc(safeUrl(href))}" target="_blank" rel="noopener">${icon(ic)}${esc(label)}</a>`;

  /* ---------- 時間（以越南時間判斷今天） ---------- */
  const vnToday = () => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const vnNow = () => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); } catch (e) { return '00:00'; } };
  const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const todayDay = () => TRIP.days.find((d) => d.date === vnToday());
  const md = (date) => { const [, m, d] = String(date || '').split('-'); return m ? `${Number(m)}/${Number(d)}` : ''; };

  function tripStatus() {
    const td = todayDay();
    if (td) return `第 <b>${TRIP.days.indexOf(td) + 1}</b> 天・今天`;
    const n = dayDiff(vnToday(), TRIP.meta.start);
    if (n > 0) return `還有 <b>${n}</b> 天出發`;
    return '旅程已結束';
  }

  /* ---------- 行程 ---------- */
  const app = $('#app');
  let view = 'itinerary';
  let currentDay = TRIP.days[0].id;
  let mapRegion = 'all';
  let foodRegion = 'hanoi';

  function placeCard(id, mode, compact) {
    const p = P(id); if (!p) return '';
    const over = `<span class="over"><b>${esc(p.name)}</b><span>${p.vn && p.vn !== p.name ? esc(p.vn) : ''}</span></span>`;
    const meta = [p.hours ? `<span>${icon('clock')}${esc(p.hours)}</span>` : '', p.price ? `<span>${icon('ticket')}${esc(p.price)}</span>` : ''].join('');
    return `<div class="pcard" data-region="${esc(p.region)}">
      <button type="button" class="ph-btn" data-place="${esc(id)}" aria-label="查看 ${esc(p.name)}">${ph(p.photo, { extra: over, sizes: compact ? '76vw' : undefined })}</button>
      ${!compact && meta ? `<div class="pmeta">${meta}</div>` : ''}
      ${!compact ? `<div class="btns">${linkBtn(gmNav(placeQ(p), mode), 'nav', '導航', 'solid')}${linkBtn(gmSearch(placeQ(p)), 'pin', '地圖')}<button type="button" class="btn" data-place="${esc(id)}">詳細</button></div>` : ''}
    </div>`;
  }

  /* 今天的時間軸：結束時間已過＝is-past，第一個還沒結束的＝is-next。
     結束早於開始（夜車 22:00–05:50）視為跨過午夜，當天都還沒結束；時間不是 HH:MM（上午、傍晚…）的項目略過。 */
  const HM = /^\d\d:\d\d$/;
  function timeMarks(d) {
    const td = todayDay();
    if (!td || td.id !== d.id) return d.items.map(() => '');
    const now = vnNow();
    let nextMarked = false;
    return d.items.map((it) => {
      if (!HM.test(it.time || '')) return '';
      const endT = HM.test(it.end || '') ? (it.end < it.time ? '24:00' : it.end) : it.time;
      if (endT < now) return 'is-past';
      if (!nextMarked) { nextMarked = true; return 'is-next'; }
      return '';
    });
  }
  function refreshMarks() {
    if (view !== 'itinerary') return;
    const marks = timeMarks(dayById(currentDay));
    $$('.tl > .tl-item').forEach((li, i) => { li.classList.toggle('is-past', marks[i] === 'is-past'); li.classList.toggle('is-next', marks[i] === 'is-next'); });
  }
  /* 每個詞（以空白分開）都放得進 48px 時間欄：中文約 4 個字、數字約 6 個字 */
  const narrowNote = (s) => String(s).split(/\s+/).every((w) => [...w].reduce((n, ch) => n + (/[\u2E80-\uFFFF]/.test(ch) ? 1 : 0.6), 0) <= 4.05);
  /* 「要先知道」：用「；」分成一行一項 */
  const factList = (text, cls = '') => {
    const parts = String(text || '').split(/[；;]\s*/).map((x) => x.trim()).filter(Boolean);
    return parts.length ? `<ul class="facts-list ${cls}">${parts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  };
  const foodMini = (f) => `<button type="button" class="mini" data-food="${esc(f.id)}" data-region="${esc(f.region)}">${ph(f.photo, { sizes: '60px' })}<span>${esc(f.vn)}</span></button>`;
  const placeRow = (id, p) => `<button type="button" class="row-item" data-place="${esc(id)}" data-region="${esc(p.region)}">
      ${ph(p.photo, { sizes: '64px' })}
      <span class="t"><b>${esc(p.name)}</b><small>${esc(p.vn && p.vn !== p.name ? p.vn : p.addr || '')}</small>
      ${p.hours || p.price || p.unverified ? `<span class="chips">${p.price ? `<span class="chip">${esc(p.price)}</span>` : ''}${p.hours ? `<span class="chip">${esc(p.hours)}</span>` : ''}${unv(p.unverified)}</span>` : ''}</span></button>`;
  // 最晚預訂：短的寫成「最晚 11/4 20:00 訂」；整句說明（含「；」或很長）改成「最晚預訂：…」才讀得通
  const byChip = (bookBy) => !bookBy ? '' : /[；;，,]/.test(bookBy) || [...bookBy].length > 14
    ? `<span class="chip st-confirm by">最晚預訂：${esc(bookBy)}</span>` : `<span class="chip st-confirm by">最晚 ${esc(bookBy)} 訂</span>`;

  /* 「這天怎麼過」：出遊（狀況好再訂）／放鬆（附近吃、按摩） */
  function optionBlock(o) {
    const chips = [byChip(o.bookBy), o.price ? `<span class="chip">${esc(o.price)}</span>` : '', o.duration ? `<span class="chip">${esc(o.duration)}</span>` : ''].join('');
    const links = (o.links || []).map((l) => linkBtn(l.url, 'ext', l.label, 'link')).join('');
    const places = (o.places || []).filter(P);
    const placesHTML = places.length ? `<div class="rows">${places.map((id) => placeRow(id, P(id))).join('')}</div>` : '';
    const foods = (o.food || []).map(F).filter(Boolean).map(foodMini).join('');
    return `<div class="opt">
      <h3>${esc(o.title)}</h3>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      ${o.desc ? `<p>${esc(o.desc)}</p>` : ''}
      ${o.tips ? `<div class="tl-tip"><span>要先知道</span>${factList(o.tips)}</div>` : ''}
      ${links ? `<div class="btns">${links}</div>` : ''}
      ${placesHTML}${foods ? `<div class="minis">${foods}</div>` : ''}
    </div>`;
  }
  function optionsHTML(d) {
    const opts = d.options || [];
    if (!opts.length) return '';
    const group = (mode, label) => { const xs = opts.filter((o) => (o.mode === 'relax' ? 'relax' : 'active') === mode); return xs.length ? `<p class="group-label">${label}</p><div class="opts">${xs.map(optionBlock).join('')}</div>` : ''; };
    return `<section class="stackish options">
      <div class="section-title"><h2>這天怎麼過</h2><small>前一兩天看狀況再決定</small></div>
      ${group('active', '狀況好就出遊')}${group('relax', '想休息')}
    </section>`;
  }

  function renderItinerary() {
    const d = dayById(currentDay);
    const td = todayDay();
    const marks = timeMarks(d);
    const credit = creditText(d.cover);

    const tiles = TRIP.days.map((x) => `<button type="button" class="tile${td && td.id === x.id ? ' is-today' : ''}" data-region="${esc(x.region)}" aria-pressed="${x.id === d.id}" data-day="${esc(x.id)}" aria-label="${esc(md(x.date))} ${esc(x.title)}">
      ${ph(x.cover, { sizes: '120px' })}<span class="w">${td && td.id === x.id ? '今天' : '週' + esc(x.dow)}</span><span class="d">${Number(x.date.slice(8))}</span></button>`).join('');

    const stay = d.stay && TRIP.stays.find((s) => s.id === d.stay);
    const facts = (stay ? [{ k: '住宿', v: stay.name, status: stay.status }] : []).concat(d.facts || [])
      .map((f) => `<div class="fact"><span class="k">${esc(f.k)}</span><span class="v">${esc(f.v)}</span>${chip(f.status)}</div>`).join('');
    const callouts = (d.alerts || []).map((a) => `<div class="callout ${esc(a.kind)}">${icon(a.kind === 'warn' ? 'warn' : a.kind === 'todo' ? 'todo' : 'info')}<div>${a.title ? `<b>${esc(a.title)}</b>` : ''}${esc(a.text)}</div></div>`).join('');

    const items = d.items.map((it, n) => {
      let cls = MOVE.includes(it.type) ? ' move' : '';
      if (it.title === '自由時間') cls += ' free';
      if (marks[n]) cls += ' ' + marks[n];
      const chips = [chip(it.status), unv(it.unverified)].join('');
      const tip = it.tip ? `<div class="tl-tip"><span>要先知道</span>${factList(it.tip)}</div>` : '';
      // 時間備註：已包含結束時間就不重複印；放不進 48px 時間欄的（例如「依實際車次」）改放在標題下面
      const note = it.timeNote || '';
      const showEnd = it.end && !note.includes(it.end);
      const noteInCol = note && narrowNote(note);
      const noteBody = note && !noteInCol ? `<p class="tl-note">${icon('clock')}${esc(note)}</p>` : '';
      const places = (it.places || []).filter(P);
      const placesHTML = places.length === 1 ? placeCard(places[0], it.mode)
        : places.length > 1 ? `<div class="hscroll">${places.map((id) => placeCard(id, it.mode, true)).join('')}</div>` : '';
      const foods = (it.food || []).map(F).filter(Boolean).map(foodMini).join('');
      const head = MOVE.includes(it.type)
        ? `<div class="ticket"><div class="ticket-head"><span class="kind">${icon(it.type)}${esc(TYPE[it.type] || '')}</span><span class="chips">${chips}</span></div><h3>${esc(it.title)}</h3>${noteBody}${it.desc ? `<p>${esc(it.desc)}</p>` : ''}</div>`
        : `${chips ? `<div class="chips">${chips}</div>` : ''}<h3>${esc(it.title)}</h3>${noteBody}${it.desc ? `<p>${esc(it.desc)}</p>` : ''}`;
      return `<li class="tl-item${cls}">
        <div class="tl-time${it.time && !HM.test(it.time) ? ' coarse' : ''}">${esc(it.time || '')}${showEnd ? `<small>${esc(it.end)}</small>` : ''}${noteInCol ? `<small>${esc(note)}</small>` : ''}</div>
        <div class="tl-line"><i></i></div>
        <div class="tl-body">${head}${tip}${placesHTML}${foods ? `<div class="minis">${foods}</div>` : ''}</div>
      </li>`;
    }).join('');

    const stops = ((d.route && d.route.stops) || []).map(P).filter(Boolean);
    const routeBtn = stops.length > 1 ? linkBtn(gmRoute(stops.map(placeQ), d.route.mode), 'route', `在 Google 地圖看今天的路線（${stops.length} 站）`, 'wide') : '';

    const dayFood = [...new Set(d.items.flatMap((i) => i.food || []))].map(F).filter(Boolean);
    const foodBlock = dayFood.length ? `<section class="stackish">
      <div class="section-title"><h2>這天吃什麼</h2><small>建議，不需訂位</small></div>
      <div class="hscroll">${dayFood.map((f) => `<div class="pcard" data-region="${esc(f.region)}"><button type="button" class="ph-btn" data-food="${esc(f.id)}" aria-label="查看 ${esc(f.vn)}">${ph(f.photo, { fallback: f.vn, sizes: '76vw', extra: `<span class="over"><b>${esc(f.name)}</b><span>${esc(f.vn)}</span></span>` })}</button></div>`).join('')}</div>
    </section>` : '';

    return `<div data-region="${esc(d.region)}">
      <header class="cover">
        ${ph(d.cover, { eager: true, fallback: d.title })}
        <div class="cover-top"><span class="brand">北越十日</span><span class="glass">${tripStatus()}</span></div>
        <div class="cover-foot">
          <div class="dateline"><span class="big">${Number(d.date.slice(8))}</span><span class="stack"><b>週${esc(d.dow)}</b><span>11 月・第 ${TRIP.days.indexOf(d) + 1} 天</span></span></div>
          <div class="placeline"><span class="where">${esc(REGION_VN[d.region] || '')}</span>${credit ? `<button type="button" class="credit-btn credit" data-credit="${esc(d.cover)}">${esc(credit)}</button>` : ''}</div>
        </div>
      </header>
      <nav class="rail" aria-label="選擇日期">${tiles}</nav>
      <div class="col day">
        <div class="day-head"><h1>${esc(d.title)}</h1>${d.lead ? `<p class="lead">${esc(d.lead)}</p>` : ''}</div>
        ${facts ? `<div class="facts">${facts}</div>` : ''}
        ${callouts ? `<div class="callouts">${callouts}</div>` : ''}
        ${routeBtn}
        <ol class="tl">${items}</ol>
        ${optionsHTML(d)}
        ${foodBlock}
        ${d.planB ? `<div class="planb"><b>備案</b>${esc(d.planB)}</div>` : ''}
        <div class="legend">${['booked', 'confirm', 'todo', 'suggest'].map((s) => chip(s)).join('')}${unv(true)}</div>
        <p class="fineprint">時間是建議安排，以越南時間（UTC+7，比台灣慢 1 小時）標示。只有「已訂」是確定的預訂，其餘出發前請以官方或訂位平台為準。</p>
      </div>
    </div>`;
  }

  /* ---------- 地圖 ---------- */
  const REGIONS = { all: '全部', hanoi: '河內', sapa: '沙壩', ninhbinh: '寧平', transit: '交通' };
  function projector(pts, W, H, pad) {
    const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const w = (maxLng - minLng) * k || 0.01, h = (maxLat - minLat) || 0.01;
    const s = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
    const ox = (W - w * s) / 2, oy = (H - h * s) / 2;
    return { x: (lng) => ox + (lng - minLng) * k * s, y: (lat) => oy + (maxLat - lat) * s, kmPerPx: 111.32 / s };
  }
  const scaleKm = (pr) => [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find((t) => t / pr.kmPerPx > 48) || 100;
  function scaleBar(pr, W, H) {
    const km = scaleKm(pr);
    const px = km / pr.kmPerPx, x0 = 16, y0 = H - 16;
    return `<g><line x1="${x0}" y1="${y0}" x2="${x0 + px}" y2="${y0}" stroke="var(--ink-2)" stroke-width="2"/>
      <line x1="${x0}" y1="${y0 - 4}" x2="${x0}" y2="${y0 + 1}" stroke="var(--ink-2)" stroke-width="2"/><line x1="${x0 + px}" y1="${y0 - 4}" x2="${x0 + px}" y2="${y0 + 1}" stroke="var(--ink-2)" stroke-width="2"/>
      <text x="${x0 + px / 2}" y="${y0 - 7}" text-anchor="middle" font-size="10" fill="var(--ink-2)">${km < 1 ? km * 1000 + ' m' : km + ' km'}</text></g>
      <g transform="translate(${W - 22},24)"><path d="M0 -12 L5 4 L0 1 L-5 4 Z" fill="var(--ink-2)"/><text y="17" text-anchor="middle" font-size="10" fill="var(--ink-2)">N</text></g>`;
  }
  /* 比例尺（左下）與指北針（右上）占的範圍，標籤與號碼不要蓋上去 */
  const mapFurniture = (pr, W, H) => [{ x0: 0, y0: H - 34, x1: 16 + scaleKm(pr) / pr.kmPerPx + 12, y1: H }, { x0: W - 36, y0: 0, x1: W, y1: 48 }];

  /* ---------- 標籤避讓：依序試幾個位置，選碰到最少東西的（資料指定的位置優先） ---------- */
  const textW = (str, fs) => [...String(str || '')].reduce((n, ch) => n + (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? fs : fs * 0.6), 0);
  const boxAt = (x, y, anchor, w, up, down) => { const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x; return { x0, x1: x0 + w, y0: y - up, y1: y + down }; };
  // 留 4px 間隔：兩個標籤貼在一起會被讀成同一個名字
  const overlaps = (a, b, m = 4) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;
  function bestSpot(cands, boxOf, obstacles, placed, W, H) {
    let best = null;
    cands.forEach((c, i) => {
      const bx = boxOf(c);
      let score = i * 0.01;
      for (const o of obstacles) if (o.x > bx.x0 - o.r && o.x < bx.x1 + o.r && o.y > bx.y0 - o.r && o.y < bx.y1 + o.r) score += o.w;
      for (const q of placed) if (overlaps(bx, q)) score += 6;
      if (bx.x0 < 2 || bx.x1 > W - 2 || bx.y0 < 2 || bx.y1 > H - 2) score += 8;
      if (!best || score < best.score) best = { c, bx, score };
    });
    placed.push(best.bx);
    return best.c;
  }
  function overviewSVG() {
    const O = TRIP.overview; const W = 360, H = 330;
    const pr = projector(O.nodes, W, H, 44);
    const node = (id) => O.nodes.find((n) => n.id === id);
    const color = { train: 'var(--sapa)', bus: 'var(--todo)', car: 'var(--ninhbinh)', flight: 'var(--ink-3)' };
    const dash = { train: '', bus: '7 5', car: '2 5', flight: '1 6' };
    const obstacles = [], placed = mapFurniture(pr, W, H);
    const links = (O.links || []).map((l) => {
      const a = node(l.from), b = node(l.to); if (!a || !b) return '';
      const x1 = pr.x(a.lng), y1 = pr.y(a.lat), x2 = pr.x(b.lng), y2 = pr.y(b.lat);
      const mx = (x1 + x2) / 2 + (l.bend || 0), my = (y1 + y2) / 2 + (l.bendY || 0);
      for (let t = 0.04; t < 0.97; t += 0.04) obstacles.push({ x: (1 - t) ** 2 * x1 + 2 * (1 - t) * t * mx + t * t * x2, y: (1 - t) ** 2 * y1 + 2 * (1 - t) * t * my + t * t * y2, r: 1.5, w: 2 });
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${color[l.kind] || 'var(--ink-3)'}" stroke-width="3" stroke-dasharray="${dash[l.kind] || ''}" stroke-linecap="round"/>`;
    }).join('');
    const nodePt = (n) => ({ x: pr.x(n.lng), y: pr.y(n.lat), r: (n.major ? 6.5 : 4.5) + 3 });
    for (const n of O.nodes) obstacles.push(Object.assign(nodePt(n), { w: 5, id: n.id }));
    const labels = (O.labels || []).map((l) => {
      const x = pr.x(l.lng), y = pr.y(l.lat);
      placed.push(boxAt(x, y, l.anchor || 'start', textW(l.text, 10) + 6, 9, 2));
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="10" letter-spacing="3" fill="var(--ink-3)" text-anchor="${esc(l.anchor || 'start')}">${esc(l.text)}</text>`;
    }).join('');
    const nodes = O.nodes.slice().sort((a, b) => (b.major ? 1 : 0) - (a.major ? 1 : 0)).map((n) => {
      const { x, y } = nodePt(n);
      const fs = n.major ? 13 : 11.5, r = n.major ? 6.5 : 4.5;
      const w = Math.max(textW(n.label, fs), n.sub ? textW(n.sub, 10) : 0);
      const down = n.sub ? 15 : 3;
      const cands = [{ anchor: n.anchor || 'start', dy: n.dy || 4 }];
      for (const dy of [4, -8, 16, -16, 24]) for (const anchor of ['start', 'end']) cands.push({ anchor, dy });
      cands.push({ anchor: 'middle', dy: -(r + 5 + (n.sub ? 13 : 0)) }, { anchor: 'middle', dy: r + fs + 3 });
      const dxOf = (anchor) => (anchor === 'end' ? -10 : anchor === 'middle' ? 0 : 10);
      const others = obstacles.filter((o) => o.id !== n.id);
      const c = bestSpot(cands, (k) => boxAt(x + dxOf(k.anchor), y + k.dy, k.anchor, w, fs * 0.8, down), others, placed, W, H);
      const tx = (x + dxOf(c.anchor)).toFixed(1), ty = y + c.dy;
      return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${n.major ? regionVar(n.region) : 'var(--paper)'}" stroke="${regionVar(n.region)}" stroke-width="2.2"/>
        <text x="${tx}" y="${ty.toFixed(1)}" text-anchor="${c.anchor}" font-size="${fs}" font-weight="700" fill="var(--ink)" paint-order="stroke" stroke="var(--paper)" stroke-width="3" stroke-linejoin="round">${esc(n.label)}</text>
        ${n.sub ? `<text x="${tx}" y="${(ty + 13).toFixed(1)}" text-anchor="${c.anchor}" font-size="10" fill="var(--ink-3)" paint-order="stroke" stroke="var(--paper)" stroke-width="3" stroke-linejoin="round">${esc(n.sub)}</text>` : ''}</g>`;
    }).join('');
    /* 河流名稱放在河道旁（垂直於河道往外推），避開路線與地點 */
    const rivers = (O.rivers || []).map((rv) => {
      const P2 = rv.pts.map(([la, ln]) => ({ x: pr.x(ln), y: pr.y(la) }));
      const pts = P2.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
      const w = textW(rv.name, 10);
      const at = Math.min(Math.max(rv.labelAt || 0, 0), P2.length - 2);
      const cands = [];
      for (const i of [at, at - 1, at + 1, at + 2]) {
        if (i < 0 || i > P2.length - 2) continue;
        const a = P2[i], b = P2[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        for (const d of [10, -10, 16, -16]) cands.push({ x: mx + nx * d, y: my + ny * d + 3.5, anchor: Math.abs(nx) < 0.3 ? 'middle' : nx * d > 0 ? 'start' : 'end' });
      }
      const c = cands.length ? bestSpot(cands, (k) => boxAt(k.x, k.y, k.anchor, w, 8, 2), obstacles, placed, W, H) : null;
      return `<polyline points="${pts}" fill="none" stroke="var(--rule)" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
        ${c ? `<text x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" text-anchor="${c.anchor}" font-size="10" fill="var(--ink-3)">${esc(rv.name)}</text>` : ''}`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="行程路線圖，依真實經緯度比例繪製"><rect width="${W}" height="${H}" fill="var(--paper)"/>${rivers}${labels}${links}${nodes}${scaleBar(pr, W, H)}</svg>`;
  }
  /* 相近的號碼互相推開幾格（最多推到不重疊），避開比例尺與指北針；推開的號碼拉一條細線回到真正的位置 */
  function spreadPins(pins, W, H, R, keepOut) {
    const min = R * 2 + 2;
    for (let it = 0; it < 200; it++) {
      let moved = false;
      for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
        const a = pins[i], b = pins[j];
        const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy);
        if (d >= min - 0.01) continue;
        const ang = j * 2.399963; // 完全重疊時用固定角度分開，每次畫出來都一樣
        const ux = d > 0.01 ? dx / d : Math.cos(ang), uy = d > 0.01 ? dy / d : Math.sin(ang);
        const push = (min - d) / 2 + 0.05;
        a.cx -= ux * push; a.cy -= uy * push; b.cx += ux * push; b.cy += uy * push; moved = true;
      }
      for (const q of pins) {
        q.cx = Math.min(W - R - 2, Math.max(R + 2, q.cx)); q.cy = Math.min(H - R - 2, Math.max(R + 2, q.cy));
        for (const k of keepOut) {
          if (q.cx + R > k.x0 && q.cx - R < k.x1 && q.cy + R > k.y0 && q.cy - R < k.y1) { q.cy = k.y1 >= H ? k.y0 - R - 1 : k.y1 + R + 1; moved = true; }
        }
      }
      if (!moved) break;
    }
    return pins;
  }
  function regionSVG(list) {
    const pts = list.filter((x) => x.n);
    if (pts.length < 2) return '';
    const W = 360, H = 250, R = 10.5;
    const pr = projector(pts.map((x) => x.p), W, H, 26);
    const grid = Array.from({ length: 7 }, (_, i) => `<line x1="${(i + 1) * W / 8}" y1="0" x2="${(i + 1) * W / 8}" y2="${H}" stroke="var(--rule)" stroke-width=".7"/>`).join('')
      + Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${(i + 1) * H / 6}" x2="${W}" y2="${(i + 1) * H / 6}" stroke="var(--rule)" stroke-width=".7"/>`).join('');
    const pins = spreadPins(pts.map((x) => { const tx = pr.x(x.p.lng), ty = pr.y(x.p.lat); return { x, tx, ty, cx: tx, cy: ty }; }), W, H, R, mapFurniture(pr, W, H));
    const leaders = pins.filter((q) => Math.hypot(q.cx - q.tx, q.cy - q.ty) > 4).map((q) => `<line x1="${q.tx.toFixed(1)}" y1="${q.ty.toFixed(1)}" x2="${q.cx.toFixed(1)}" y2="${q.cy.toFixed(1)}" stroke="var(--ink-3)" stroke-width="1"/>
        <circle cx="${q.tx.toFixed(1)}" cy="${q.ty.toFixed(1)}" r="2.2" fill="${regionVar(q.x.p.region)}"/>`).join('');
    const dots = pins.map((q) => `<g><circle cx="${q.cx.toFixed(1)}" cy="${q.cy.toFixed(1)}" r="${R}" fill="${regionVar(q.x.p.region)}" stroke="var(--paper)" stroke-width="2"/>
        <text x="${q.cx.toFixed(1)}" y="${(q.cy + 3.8).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--paper)">${q.x.n}</text></g>`).join('');
    return `<div class="mapframe"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="地點相對位置，依經緯度比例繪製"><rect width="${W}" height="${H}" fill="var(--paper)"/>${grid}${leaders}${dots}${scaleBar(pr, W, H)}</svg>
      <div class="map-legend"><span>號碼對應下方地點；有座標的地點才會標在圖上，靠得太近的號碼稍微推開，細線指向實際位置。這是依經緯度畫的相對位置，不是街道地圖，實際怎麼走請按導航。</span></div></div>`;
  }
  function renderMap() {
    const seg = Object.keys(REGIONS).map((k) => `<button type="button" data-region-filter="${k}" aria-pressed="${mapRegion === k}">${REGIONS[k]}</button>`).join('');
    const list = Object.entries(TRIP.places).filter(([, p]) => !p.hidden && (mapRegion === 'all' || p.region === mapRegion)).map(([id, p]) => ({ id, p, n: 0 }));
    // 只有畫在地區小地圖上的地點（有經緯度）才編號
    const hasXY = (p) => typeof p.lat === 'number' && typeof p.lng === 'number';
    if (mapRegion !== 'all' && list.filter((x) => hasXY(x.p)).length >= 2) { let k = 0; for (const x of list) if (hasXY(x.p)) x.n = ++k; }
    const cards = list.map(({ id, p, n }) => `<button type="button" class="gcard" data-place="${esc(id)}" data-region="${esc(p.region)}">
      ${ph(p.photo, { fallback: p.name, sizes: '(max-width: 640px) 50vw, 240px', extra: n ? `<span class="n">${n}</span>` : '' })}
      <b>${esc(p.name)}</b><span>${esc(p.vn || '')}</span>${p.status || p.unverified ? `<span class="chips">${chip(p.status)}${unv(p.unverified)}</span>` : ''}</button>`).join('');
    const legs = (TRIP.overview.legs || []).map((l) => `<div><b>${esc(l.k)}</b><span>${esc(l.v)}</span></div>`).join('');
    return `<div class="col view">
      <header class="page-head"><h1>地圖</h1><p>依真實經緯度比例畫的路線；每個地點都能直接開 Google 地圖導航。</p></header>
      <div class="mapframe">${overviewSVG()}
        <div class="map-legend"><span><i style="border-color:var(--ink-3);border-top-style:dotted"></i>航班</span><span><i style="border-color:var(--sapa)"></i>夜車 11/3</span><span><i style="border-color:var(--todo);border-top-style:dashed"></i>夜巴 11/8（待訂）</span><span><i style="border-color:var(--ninhbinh);border-top-style:dotted"></i>接駁、包車</span></div>
      </div>
      ${legs ? `<div class="legs">${legs}</div>` : ''}
      <div class="section-title"><h2>地點</h2><small>${list.length} 處</small></div>
      <div class="seg" role="group" aria-label="篩選地區">${seg}</div>
      ${mapRegion !== 'all' ? regionSVG(list) : ''}
      <div class="grid2">${cards}</div>
      <p class="fineprint">出發前建議在 Google 地圖下載「河內」「沙壩」「寧平」的離線地圖；沙壩山區步道訊號不穩。</p>
    </div>`;
  }

  /* ---------- 美食 ---------- */
  const FREG = { hanoi: '河內', sapa: '沙壩', ninhbinh: '寧平' };
  function renderFood() {
    const seg = Object.keys(FREG).map((k) => `<button type="button" data-fregion="${k}" aria-pressed="${foodRegion === k}">${FREG[k]}</button>`).join('');
    const dishes = TRIP.dishes.filter((x) => x.region === foodRegion).map((x) => `<button type="button" class="gcard dish" data-dish="${esc(x.id)}" data-region="${esc(x.region)}">
      ${ph(x.photo, { fallback: x.vn, sizes: '(max-width: 640px) 50vw, 240px' })}<b>${esc(x.vn)}</b><em>${esc(x.zh)}</em></button>`).join('');
    const rests = TRIP.food.filter((f) => f.region === foodRegion).map((f) => `<button type="button" class="row-item" data-food="${esc(f.id)}" data-region="${esc(f.region)}">
      ${ph(f.photo, { sizes: '64px' })}
      <span class="t"><b>${esc(f.vn)}</b><small>${esc(f.name)}${f.dish ? `：${esc(f.dish)}` : ''}</small>
      <span class="chips">${f.michelin ? `<span class="chip michelin">${esc(f.michelin)}</span>` : ''}${f.price ? `<span class="chip">${esc(f.price)}</span>` : ''}${unv(f.unverified)}</span></span></button>`).join('');
    const spas = Object.entries(TRIP.places).filter(([, p]) => !p.hidden && p.region === foodRegion && String(p.cat || '').trim() === '按摩').map(([id, p]) => placeRow(id, p)).join('');
    return `<div class="col view" data-region="${foodRegion}">
      <header class="page-head"><h1>吃什麼</h1><p>點開菜色可以全螢幕顯示越南文，直接給店家看。</p></header>
      <div class="seg" role="group" aria-label="篩選城市">${seg}</div>
      <div class="section-title"><h2>必吃</h2></div>
      <div class="grid2">${dishes}</div>
      <div class="section-title"><h2>店家</h2><small>米其林標示依 2026 年越南指南</small></div>
      <div class="rows">${rests || '<p class="fineprint" style="padding:12px 0">這一區以現場挑選為主。</p>'}</div>
      <p class="fineprint">路邊攤多半只收現金，賣完就提早收攤；營業時間以現場為準。</p>
      ${spas ? `<div class="section-title"><h2>按摩</h2><small>走累了可以去</small></div><div class="rows">${spas}</div>` : ''}
    </div>`;
  }

  /* ---------- 預訂與花費 ---------- */
  function renderBook() {
    const counts = ['booked', 'confirm', 'todo', 'suggest'].map((s) => `<div><b class="num" style="color:var(--${{ booked: 'ok', confirm: 'warn', todo: 'todo', suggest: 'sug' }[s]})">${TRIP.bookings.filter((b) => b.status === s).length}</b><span>${STATUS[s]}</span></div>`).join('');
    const row = (b) => `<div class="bk"><div class="when">${esc(md(b.date) || '')}${b.when && b.when !== md(b.date) ? `<small>${esc(b.when)}</small>` : ''}</div>
      <div class="t"><div class="chips">${chip(b.status)}${b.type ? `<span class="chip">${esc(b.type)}</span>` : ''}</div><h3>${esc(b.title)}</h3>
      ${b.detail ? `<p>${esc(b.detail)}</p>` : ''}${b.next ? `<p class="next"><span>${b.status === 'booked' ? '提醒' : '下一步'}</span>${esc(b.next)}${b.due ? `（建議 ${esc(md(b.due) || b.due)} 前）` : ''}</p>` : ''}
      ${bkButtons(b)}</div></div>`;
    const bkButtons = (b) => {
      const links = (b.links || []).map((l) => linkBtn(l.url, 'ext', l.label, 'link')).join('');
      const place = b.place && P(b.place) ? `${linkBtn(gmNav(placeQ(P(b.place))), 'nav', '導航')}<button type="button" class="btn" data-place="${esc(b.place)}">地點</button>` : '';
      return links || place ? `<div class="btns">${links}${place}</div>` : '';
    };
    const optRow = ({ d, o }) => `<div class="bk" data-region="${esc(d.region)}"><div class="when">${esc(md(d.date))}<small>週${esc(d.dow)}</small></div>
      <div class="t"><div class="chips">${byChip(o.bookBy)}${o.price ? `<span class="chip">${esc(o.price)}</span>` : ''}${o.duration ? `<span class="chip">${esc(o.duration)}</span>` : ''}</div><h3>${esc(o.title)}</h3>
      ${o.desc ? `<p>${esc(o.desc)}</p>` : ''}
      <div class="btns">${(o.links || []).map((l) => linkBtn(l.url, 'ext', l.label, 'link')).join('')}<a class="btn" href="#day-${esc(d.id)}">看這天</a></div></div></div>`;
    const flex = TRIP.days.flatMap((d) => (d.options || []).filter((o) => o.mode !== 'relax').map((o) => ({ d, o })));
    const byDate = (a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999'));
    const pending = TRIP.bookings.filter((b) => b.status === 'confirm' || b.status === 'todo').sort(byDate);
    const booked = TRIP.bookings.filter((b) => b.status === 'booked');
    const other = TRIP.bookings.filter((b) => !['confirm', 'todo', 'booked'].includes(b.status));
    const stays = TRIP.stays.map((s) => {
      const p = s.place && P(s.place);
      const first = (s.dates || '').split(/[–~-]/)[0].trim();
      return `<div class="bk" data-region="${esc(p ? p.region : 'transit')}"><div class="when">${esc(first)}${s.dates && s.dates.trim() !== first ? `<small>${esc(s.dates)}</small>` : ''}</div>
      <div class="t"><div class="chips">${chip(s.status)}${unv(s.unverified)}</div><h3>${esc(s.name)}</h3>
      ${s.addr ? `<p class="vn">${esc(s.addr)}</p>` : ''}${s.inout ? `<p>${esc(s.inout)}</p>` : ''}${s.area ? `<p>${esc(s.area)}</p>` : ''}${s.note ? `<p>${esc(s.note)}</p>` : ''}
      ${p ? `<div class="btns">${linkBtn(gmNav(placeQ(p)), 'nav', '導航')}<button type="button" class="btn" data-show-place="${esc(s.place)}">${icon('show')}給司機看</button></div>` : ''}</div></div>`;
    }).join('');
    return `<div class="col view">
      <header class="page-head"><h1>預訂與花費</h1><p>這裡不會出現票號與訂位代碼，請以各平台的確認信為準。</p></header>
      <div class="counts">${counts}</div>
      ${pending.length ? `<p class="group-label">還要處理</p><div>${pending.map(row).join('')}</div>` : ''}
      ${flex.length ? `<p class="group-label">可以臨時訂的行程<small>前一兩天看狀況再訂，注意最晚預訂時間</small></p><div>${flex.map(optRow).join('')}</div>` : ''}
      <p class="group-label">已訂好</p><div>${booked.map(row).join('')}</div>
      ${other.length ? `<p class="group-label">建議安排</p><div>${other.map(row).join('')}</div>` : ''}
      <div class="section-title"><h2>住宿</h2></div>
      <div>${stays}</div>
      ${spendHTML()}
    </div>`;
  }

  const expSyncText = (p, f) => [f ? `${f} 筆寫回失敗` : '', p ? `${p} 筆等待同步` : ''].filter(Boolean).join('，');
  function spendHTML() {
    const r = rate();
    const pax = Math.max(1, Number(store.get('pax', 0)) || 1);
    const unit = store.get('expUnit', 'vnd');
    const twdOf = (e) => Number(e.twd) || (Number(e.vnd) ? Number(e.vnd) / r : 0);
    const exps = TRIP.expenses.slice().sort((a, b) => String(b.created || b.date).localeCompare(String(a.created || a.date)));
    const total = exps.reduce((s, e) => s + twdOf(e), 0);
    const pendingN = exps.filter((e) => e.pending && !e.failed).length;
    const failedN = exps.filter((e) => e.failed).length;
    const byCat = {};
    for (const e of exps) byCat[e.cat] = (byCat[e.cat] || 0) + twdOf(e);
    const est = {};
    for (const b of TRIP.budget) {
      const m = b.per === 'group' ? 1 : pax;
      est[b.cat] = est[b.cat] || { lo: 0, hi: 0, items: [] };
      if (b.low != null) est[b.cat].lo += b.low * m / r;
      if (b.high != null || b.low != null) est[b.cat].hi += (b.high ?? b.low) * m / r;
      est[b.cat].items.push(b);
    }
    const lo = Object.values(est).reduce((s, x) => s + x.lo, 0), hi = Object.values(est).reduce((s, x) => s + x.hi, 0);
    const cats = Object.keys(CAT);
    const list = exps.map((e) => `<div class="exp"><b>${esc(e.item || CAT[e.cat] || '花費')}</b><span class="amt">NT$ ${fmt(twdOf(e))}</span>
      <small>${esc(md(e.date))}・${esc(CAT[e.cat] || '其他')}${e.vnd ? `・${fmt(e.vnd)} ₫` : ''}${e.by ? `・${esc(e.by)} 付` : ''}${e.failed ? `・<span class="err">寫回失敗：${esc(e.failed)}</span>` : e.pending ? '・等待同步' : ''}</small>
      <span class="exp-acts">${e.failed ? `<button type="button" class="del" data-retry-exp="${esc(e.id)}">重試</button>` : ''}<button type="button" class="del" data-del-exp="${esc(e.id)}">刪除</button></span></div>`).join('');
    const table = cats.filter((c) => est[c] || byCat[c]).map((c) => `<tr><td>${esc(CAT[c])}<br><small>${esc(est[c] ? est[c].items.map((b) => b.item).join('、') : '')}</small></td>
      <td class="r">${est[c] ? `${fmt(est[c].lo)}–${fmt(est[c].hi)}` : '—'}</td><td class="r">${byCat[c] ? fmt(byCat[c]) : '—'}</td></tr>`).join('');
    return `<section class="stackish">
      <div class="section-title"><h2>記帳</h2><small id="exp-sync">${expSyncText(pendingN, failedN)}</small></div>
      <form class="form" id="exp-form" autocomplete="off">
        <div class="field"><span class="field-row">金額<span class="unit-toggle" role="group" aria-label="幣別"><button type="button" data-unit="vnd" aria-pressed="${unit === 'vnd'}">VND</button><button type="button" data-unit="twd" aria-pressed="${unit === 'twd'}">TWD</button></span></span>
          <input class="amount" id="exp-amount" inputmode="decimal" placeholder="${unit === 'vnd' ? '例如 150000' : '例如 190'}" aria-label="金額"></div>
        <div class="two"><label class="field">項目<input id="exp-item" placeholder="例如 牛肉河粉"></label>
          <label class="field">類別<select id="exp-cat">${cats.map((c) => `<option value="${c}"${c === store.get('expCat', 'food') ? ' selected' : ''}>${CAT[c]}</option>`).join('')}</select></label></div>
        <div class="two"><label class="field">付款人（可空白）<input id="exp-by" value="${esc(store.get('payer', ''))}"></label>
          <div class="field"><span>&nbsp;</span><button class="btn solid" type="submit" style="min-height:44px">記一筆</button></div></div>
        <p class="fineprint" id="exp-preview"></p>
      </form>
      <div class="sum-line"><span>目前花費</span><b>NT$ ${fmt(total)}</b></div>
      <div>${list || '<p class="fineprint" style="padding:10px 0">還沒有記帳。旅途中每花一筆就記在這裡；設定 Google Sheet 後會自動寫回「記帳」分頁。</p>'}</div>
      ${apiUrl() && !writeKey() ? '<p class="fineprint">還沒填寫入密碼，這裡只有這支手機記的帳；到「出發前 → Google Sheet 同步」填入密碼後，才會寫回試算表並讀到同行者記的帳。</p>' : ''}
      <div id="exp-confirm" class="callout warn" hidden>${icon('warn')}<div><b>刪除這筆記帳？</b><div class="btns" style="margin-top:8px"><button class="btn solid" type="button" id="exp-del-yes">刪除</button><button class="btn" type="button" id="exp-del-no">取消</button></div></div></div>
      <div class="section-title"><h2>預算</h2><small>估算以每人計，可改人數</small></div>
      <div class="form"><div class="two"><label class="field">人數<input id="pax" type="number" min="1" max="8" value="${pax}"></label>
        <label class="field">匯率（1 TWD = ? VND）<input id="rate-b" type="number" value="${r}"></label></div></div>
      <div class="tablewrap"><table class="budget"><thead><tr><th>類別</th><th class="r">估算 NT$</th><th class="r">實際 NT$</th></tr></thead>
        <tbody>${table}</tbody><tfoot><tr><td><b>合計</b><br><small>${pax} 人；不含機票與已付住宿</small></td><td class="r"><b>${fmt(lo)}–${fmt(hi)}</b></td><td class="r"><b>${fmt(total)}</b></td></tr></tfoot></table></div>
      <p class="fineprint">${esc(TRIP.meta.rate.note)}</p>
    </section>`;
  }

  /* ---------- 出發前 ---------- */
  function renderPrep() {
    const all = TRIP.checklist.flatMap((g) => g.items);
    const n = all.filter((i) => i.done).length;
    const groups = TRIP.checklist.map((g) => `<div class="check-group"><h3>${esc(g.group)}</h3>
      ${g.items.map((i) => `<label class="chk${i.done ? ' done' : ''}" for="ck-${esc(i.id)}"><input type="checkbox" id="ck-${esc(i.id)}" data-check="${esc(i.id)}" ${i.done ? 'checked' : ''}>
      <span class="t">${esc(i.text)}${i.critical ? '<span class="chip st-todo">重要</span>' : ''}<small>${esc(i.note || '')}</small></span></label>`).join('')}</div>`).join('');
    const tips = TRIP.tips.map((t) => `<details class="fold"><summary>${esc(t.title)}</summary><ul>${t.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${t.src.length ? `<div class="src">${t.src.map((u) => S.httpUrl(u) ? extLink(u, u) : `<span>${esc(u)}</span>`).join('')}</div>` : ''}</details>`).join('');
    const contacts = TRIP.contacts.map((c) => `<div class="contact"><b>${esc(c.name)}</b><div class="line"><span class="numtxt">${esc(c.num)}</span><button class="btn quiet" type="button" data-copy="${esc(c.num)}">${icon('copy')}複製</button></div>${c.note ? `<small>${esc(c.note)}</small>` : ''}</div>`).join('');
    const phrases = TRIP.phrases.map((p, i) => `<div class="phr"><b>${esc(p.vn)}</b><span>${esc(p.zh)}</span><button class="btn quiet" type="button" data-show-phrase="${i}" aria-label="全螢幕顯示">${icon('show')}</button></div>`).join('');
    const used = new Set();
    TRIP.days.forEach((d) => used.add(d.cover));
    Object.values(TRIP.places).forEach((p) => used.add(p.photo));
    TRIP.food.forEach((f) => used.add(f.photo)); TRIP.dishes.forEach((d) => used.add(d.photo));
    /* CC BY / BY-SA 2.0、3.0 要求標示作品標題：標題取自 Commons 檔名 */
    const credits = Object.entries(TRIP.photos).filter(([k, p]) => used.has(k) && p.credit).map(([, p]) => `<div>${p.title ? `「${esc(p.title)}」` : esc(p.alt || '')}，${esc(p.credit)}，${extLink(p.licenseUrl, p.license || '授權')}${S.httpUrl(p.source) ? `，${extLink(p.source, '原始頁面')}` : ''}</div>`).join('');
    return `<div class="col view">
      <header class="page-head"><h1>出發前</h1><p>勾選會同步到 Google Sheet 的「行前清單」分頁，同行的人也看得到。</p></header>
      <div class="section-title"><h2>行前清單</h2><small class="num" id="chk-count">${n} / ${all.length} 完成</small></div>
      <div class="progress" aria-hidden="true"><i style="width:${all.length ? Math.round((n / all.length) * 100) : 0}%"></i></div>
      <div>${groups}</div>
      <div class="section-title"><h2>Google Sheet 同步</h2></div>
      <div class="form">
        <p class="sync-note" id="sync-status"></p>
        <label class="field">資料 API 網址（Apps Script 網頁應用程式）<input id="api-url" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(apiUrl())}"></label>
        <label class="field">寫入密碼（勾清單、記帳時寫回 Sheet）<input id="write-key" type="password" autocomplete="off" value="${esc(writeKey())}"></label>
        <div class="btns"><button class="btn solid" type="button" id="sync-now">${icon('sync')}立即同步</button><button class="btn" type="button" id="test-key">測試寫入密碼</button></div>
        <p class="fineprint">網址可以公開：只靠網址讀得到行程，讀不到記帳。記帳與勾選要有寫入密碼才能讀寫；密碼只存在這支手機，不會寫進網站程式。</p>
      </div>
      <div class="section-title"><h2>匯率換算</h2><small>可自行修改匯率</small></div>
      <div class="form">
        <label class="field">1 新台幣 = ? 越南盾<input id="rate" type="number" inputmode="decimal" value="${rate()}"></label>
        <div class="two"><label class="field">越南盾 VND<input class="amount" id="vnd" inputmode="numeric" value="100,000"></label><label class="field">新台幣 TWD<input class="amount" id="twd" inputmode="decimal"></label></div>
        <div class="btns">${[10000, 30000, 50000, 100000, 200000, 500000].map((v) => `<button class="btn quiet" type="button" data-vnd="${v}">${v / 1000}k</button>`).join('')}</div>
        <p class="fineprint">越南價格常寫成「50k」，就是 50,000 VND。${esc(TRIP.meta.rate.note)}</p>
      </div>
      <div class="section-title"><h2>注意事項</h2></div>
      <div style="border-top:1px solid var(--rule)">${tips}</div>
      <div class="section-title"><h2>緊急聯絡</h2></div>
      <div style="border-top:1px solid var(--rule)">${contacts}</div>
      <div class="section-title"><h2>實用越南語</h2><small>右側按鈕可全螢幕出示</small></div>
      <div style="border-top:1px solid var(--rule)">${phrases}</div>
      <div class="section-title"><h2>安裝到手機</h2></div>
      <div class="form">
        <p>加到主畫面後可以像 App 一樣開啟，開過一次之後離線也能看行程與照片（Google 地圖連結仍需網路）。</p>
        <p><b>iPhone（Safari）</b>分享 →「加入主畫面」。<b>Android（Chrome）</b>選單 →「安裝應用程式」。</p>
        <div class="btns"><button class="btn solid" type="button" id="install-btn" hidden>安裝北越十日</button><button class="btn" type="button" id="cache-photos">下載大張照片供離線使用</button></div>
        <p class="fineprint" id="sw-status"></p>
      </div>
      <div class="section-title"><h2>照片來源</h2></div>
      <div class="credits">${credits || '<p class="fineprint">—</p>'}<p class="fineprint">照片來自 Wikimedia Commons，依各自的 CC 授權使用，已縮放與裁切。</p></div>
    </div>`;
  }

  /* ---------- 底部詳情頁 ---------- */
  const sheetWrap = $('#sheet');
  let lastFocus = null;
  function openSheet(region, html) {
    lastFocus = document.activeElement;
    sheetWrap.dataset.region = region || 'transit';
    $('.sheet', sheetWrap).innerHTML = html;
    sheetWrap.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => sheetWrap.classList.add('open')));
    $('.sheet', sheetWrap).scrollTop = 0;
    const c = $('.sheet-close', sheetWrap); if (c) c.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (sheetWrap.hidden) return;
    sheetWrap.classList.remove('open');
    setTimeout(() => { sheetWrap.hidden = true; $('.sheet', sheetWrap).innerHTML = ''; if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); }, 260);
  }
  /* 關閉鈕包在高度 0 的 sticky 容器裡，捲動長內容時一直留在右上角 */
  const closeBtn = (plain) => `<div class="sheet-x"><button type="button" class="sheet-close${plain ? ' plain' : ''}" data-close-sheet aria-label="關閉">${icon('close')}</button></div>`;
  const heroPh = (key, fallback) => photoInfo(key) ? ph(key, { cls: 'hero', fallback, eager: true, extra: creditText(key) ? `<span class="credit">${esc(creditText(key))}</span>` : '' }) : '';
  const srcList = (src) => src && src.length ? `<details class="fold"><summary>資料來源</summary><div class="src">${src.map((u) => S.httpUrl(u) ? extLink(u, u) : `<span>${esc(u)}</span>`).join('')}</div></details>` : '';
  const kv = (rows) => { const r = rows.filter((x) => x[1]); return r.length ? `<dl class="kv">${r.map(([k, v, cls]) => `<div><dt>${esc(k)}</dt><dd class="${cls || ''}">${esc(v)}</dd></div>`).join('')}</dl>` : ''; };

  function placeSheet(id) {
    const p = P(id); if (!p) return;
    const hero = heroPh(p.photo, p.name);
    openSheet(p.region, `${closeBtn(!hero)}${hero}<div class="sheet-body">
      <div class="chips"><span class="chip">${esc(REGION_ZH[p.region] || '')}</span>${chip(p.status)}${unv(p.unverified)}</div>
      <h2>${esc(p.name)}</h2><p class="vnname">${esc(p.vn || '')}</p>
      ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ''}
      ${kv([['時間', p.hours], ['票價', p.price], ['地址', p.addr, 'vn'], ['行程', p.days]])}
      ${p.tips ? `<div class="callout info">${icon('info')}<div>${esc(p.tips)}</div></div>` : ''}
      <div class="btns">${linkBtn(gmNav(placeQ(p)), 'nav', '導航', 'solid')}${linkBtn(gmSearch(placeQ(p)), 'pin', 'Google 地圖')}${p.addr ? `<button type="button" class="btn" data-show-place="${esc(id)}">${icon('show')}給司機看</button>` : ''}</div>
      ${srcList(p.src)}</div>`);
  }
  function foodSheet(id) {
    const f = F(id); if (!f) return;
    const hero = heroPh(f.photo, f.vn);
    openSheet(f.region, `${closeBtn(!hero)}${hero}<div class="sheet-body">
      <div class="chips"><span class="chip">${esc(REGION_ZH[f.region] || '')}</span>${f.michelin ? `<span class="chip michelin">${esc(f.michelin)}</span>` : ''}${unv(f.unverified)}</div>
      <h2 style="font-family:var(--font-vn)">${esc(f.vn)}</h2><p class="vnname" style="font-family:var(--font-body)">${esc(f.name)}</p>
      ${f.dish ? `<p class="summary">${esc(f.dish)}</p>` : ''}
      ${kv([['時間', f.hours], ['價位', f.price], ['地址', f.addr, 'vn'], ['搭配', f.day]])}
      ${f.note ? `<div class="callout info">${icon('info')}<div>${esc(f.note)}</div></div>` : ''}
      <div class="btns">${linkBtn(gmNav(foodQ(f), 'walking'), 'nav', '導航', 'solid')}${linkBtn(gmSearch(foodQ(f)), 'pin', 'Google 地圖')}</div>
      ${srcList(f.src)}</div>`);
  }
  function dishSheet(id) {
    const d = TRIP.dishes.find((x) => x.id === id); if (!d) return;
    const where = TRIP.food.filter((f) => f.region === d.region && f.photo && f.photo === d.photo);
    const hero = heroPh(d.photo, d.vn);
    openSheet(d.region, `${closeBtn(!hero)}${hero}<div class="sheet-body">
      <p class="showname">${esc(d.vn)}</p><p class="vnname" style="font-family:var(--font-body);margin-top:-4px;font-size:16px">${esc(d.zh)}</p>
      ${d.desc ? `<p class="summary">${esc(d.desc)}</p>` : ''}
      <div class="btns"><button type="button" class="btn solid" data-show-dish="${esc(d.id)}">${icon('show')}全螢幕給店家看</button></div>
      ${where.length ? `<div class="section-title"><h2 style="font-size:19px">哪裡吃</h2></div><div class="rows">${where.map((f) => `<button type="button" class="row-item" data-food="${esc(f.id)}">${ph(f.photo, { sizes: '64px' })}<span class="t"><b>${esc(f.vn)}</b><small>${esc(f.addr)}</small></span></button>`).join('')}</div>` : ''}
    </div>`);
  }
  function creditSheet(key) {
    const p = TRIP.photos[key]; if (!p) return;
    openSheet('transit', `${closeBtn(true)}<div class="sheet-body"><h2>照片來源</h2><p>${esc(p.alt || '')}</p>
      ${kv([['作品', p.title], ['作者', p.credit], ['授權', p.license]])}
      <div class="btns">${S.httpUrl(p.source) ? linkBtn(p.source, 'pin', '原始頁面') : ''}${S.httpUrl(p.licenseUrl) ? linkBtn(p.licenseUrl, 'info', '授權條款') : ''}</div>
      <p class="fineprint">照片來自 Wikimedia Commons，已縮放與裁切。</p></div>`);
  }

  /* ---------- 全螢幕出示卡 ---------- */
  const showEl = $('#show');
  function showCard(big, sub, hint, addr) {
    $('.big', showEl).innerHTML = esc(big) + (addr ? `<span class="addr">${esc(addr)}</span>` : '');
    $('.sub', showEl).textContent = sub || ''; $('.hint', showEl).textContent = hint || '';
    showEl.hidden = false; $('#show-close').focus();
  }

  /* ---------- 渲染與路由 ---------- */
  const VIEWS = { itinerary: renderItinerary, map: renderMap, food: renderFood, book: renderBook, prep: renderPrep };
  function render(scrollTop) {
    const y = window.scrollY;
    app.innerHTML = VIEWS[view]();
    $$('.tabbar a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === view ? 'page' : 'false'));
    if (view === 'itinerary') { const t = $('.tile[aria-pressed="true"]'); if (t) t.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    if (view === 'prep') { convFrom('vnd'); updateSyncUI(); updateInstallUI(); }
    if (view === 'book') expPreview();
    window.scrollTo(0, scrollTop ? 0 : y);
  }
  function route() {
    const h = (location.hash || '').slice(1);
    if (h === 'today' || h === '' || h === 'itinerary') {
      view = 'itinerary';
      const td = todayDay();
      if (h === 'today' || (!h && td)) currentDay = (td || TRIP.days[0]).id;
    } else if (/^day-\d{4}$/.test(h) && TRIP.days.some((d) => d.id === h.slice(4))) { view = 'itinerary'; currentDay = h.slice(4); }
    else if (VIEWS[h]) view = h;
    closeSheet();
    render(true);
  }
  window.addEventListener('hashchange', route);

  /* ---------- 事件 ---------- */
  let pendingDelete = null;
  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('sheet-backdrop')) { closeSheet(); return; }
    const t = e.target.closest('button, a');
    if (!t) return;
    const ds = t.dataset;
    if ('closeSheet' in ds) { closeSheet(); return; }
    if (ds.day) { currentDay = ds.day; history.replaceState(null, '', '#day-' + currentDay); render(true); return; }
    if (ds.place) { placeSheet(ds.place); return; }
    if (ds.food) { foodSheet(ds.food); return; }
    if (ds.dish) { dishSheet(ds.dish); return; }
    if (ds.credit) { creditSheet(ds.credit); return; }
    if (ds.regionFilter) { mapRegion = ds.regionFilter; render(false); return; }
    if (ds.fregion) { foodRegion = ds.fregion; render(false); return; }
    if (ds.showPlace) { const p = P(ds.showPlace); if (p) showCard(p.vn || p.name, p.name, 'Làm ơn chở tôi đến địa chỉ này.', p.addr); return; }
    if (ds.showDish) { const d = TRIP.dishes.find((x) => x.id === ds.showDish); if (d) showCard(d.vn, d.zh, 'Cho tôi món này.'); return; }
    if (ds.showPhrase) { const p = TRIP.phrases[Number(ds.showPhrase)]; if (p) showCard(p.vn, p.zh, ''); return; }
    if (t.id === 'show-close') { showEl.hidden = true; return; }
    if (ds.copy) { copyText(ds.copy); return; }
    if (ds.vnd) { $('#vnd').value = Number(ds.vnd).toLocaleString('en-US'); convFrom('vnd'); return; }
    if (ds.unit) { store.set('expUnit', ds.unit); $$('.unit-toggle button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.unit === ds.unit)); $('#exp-amount').placeholder = ds.unit === 'vnd' ? '例如 150000' : '例如 190'; expPreview(); return; }
    if (ds.retryExp) { retryExpense(ds.retryExp); return; }
    if (ds.delExp) { pendingDelete = ds.delExp; const c = $('#exp-confirm'); c.hidden = false; c.scrollIntoView({ block: 'nearest' }); return; }
    if (t.id === 'exp-del-no') { pendingDelete = null; $('#exp-confirm').hidden = true; return; }
    if (t.id === 'exp-del-yes') { deleteExpense(pendingDelete); pendingDelete = null; return; }
    if (t.id === 'sync-now') { saveSyncSettings(); keyRejected = null; pull(true); return; }
    if (t.id === 'test-key') { saveSyncSettings(); testKey(); return; }
    if (t.id === 'install-btn' && deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; updateInstallUI(); }); return; }
    if (t.id === 'cache-photos') { cacheAllPhotos(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!showEl.hidden) showEl.hidden = true; else closeSheet();
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.check) toggleCheck(t.dataset.check, t.checked, t);
    if (t.id === 'pax') { store.set('pax', Math.max(1, Math.min(8, Number(t.value) || 1))); render(false); }
    if (t.id === 'rate-b') { const r = Number(t.value); if (r > 0) store.set('rate', r); render(false); }
    if (t.id === 'api-url' || t.id === 'write-key') saveSyncSettings();
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'rate') { const r = Number(t.value); if (r > 0) { store.set('rate', r); convFrom('vnd'); } }
    if (t.id === 'vnd') convFrom('vnd');
    if (t.id === 'twd') convFrom('twd');
    if (t.id === 'exp-amount') expPreview();
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'exp-form') return;
    e.preventDefault();
    addExpense();
  });

  function copyText(v) {
    try { navigator.clipboard.writeText(v).then(() => toast('已複製 ' + v), () => toast('無法自動複製，請長按號碼選取')); }
    catch (err) { toast('無法自動複製，請長按號碼選取'); }
  }
  function convFrom(which) {
    const el = $('#rate'); if (!el) return;
    const r = Number(el.value) || rate();
    const num = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;
    if (which === 'vnd') { const v = num($('#vnd').value); $('#twd').value = v ? (v / r).toFixed(v / r < 100 ? 1 : 0) : ''; }
    else { const v = num($('#twd').value); $('#vnd').value = v ? Math.round(v * r).toLocaleString('en-US') : ''; }
  }
  let toastTimer;
  function toast(msg) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  /* ---------- 勾選清單 ---------- */
  function toggleCheck(id, done, input) {
    const checks = store.get('checks', {}); checks[id] = done; store.set('checks', checks);
    for (const g of TRIP.checklist) for (const i of g.items) if (i.id === id) { i.done = done; i.pending = true; }
    if (input) input.closest('.chk').classList.toggle('done', done);
    const all = TRIP.checklist.flatMap((g) => g.items); const n = all.filter((i) => i.done).length;
    const c = $('#chk-count'); if (c) c.textContent = `${n} / ${all.length} 完成`;
    const bar = $('.progress i'); if (bar) bar.style.width = Math.round((n / all.length) * 100) + '%';
    // 同一項還沒送出的勾選換成最新的一筆（正在送出的那筆不動）；改回試算表上的值而且沒有正在送出的，就整筆取消
    const q = outbox().filter((o) => !(o.action === 'check' && o.id === id && o.opId !== inflight));
    store.set('outbox', q);
    const row = (tablesNow().checklist || []).find((r) => rowVal(r, 'check_id') === id);
    const sheetDone = row ? S.toValue(rowVal(row, 'done'), 'bool') : null;
    if (sheetDone === done && !q.some((o) => o.action === 'check' && o.id === id)) {
      delete checks[id]; store.set('checks', checks);
      for (const g of TRIP.checklist) for (const i of g.items) if (i.id === id) i.pending = false;
      updateSyncUI();
      return;
    }
    queue({ action: 'check', id, done });
  }

  /* ---------- 記帳 ---------- */
  function expAmounts() {
    const raw = Number(String(($('#exp-amount') || {}).value || '').replace(/[^\d.]/g, '')) || 0;
    const unit = store.get('expUnit', 'vnd'); const r = rate();
    return unit === 'vnd' ? { vnd: Math.round(raw), twd: Math.round(raw / r) } : { twd: Math.round(raw), vnd: Math.round(raw * r) };
  }
  function expPreview() {
    const el = $('#exp-preview'); if (!el) return;
    const a = expAmounts();
    el.textContent = a.vnd ? `${fmt(a.vnd)} VND，約 NT$ ${fmt(a.twd)}（匯率 ${rate()}）` : '';
  }
  const expenseOp = (e) => ({ action: 'expense.add', expense: {
    expense_id: e.id, date: e.date, item: e.item || '', category: CAT[e.cat] || CAT.other, amount_vnd: e.vnd, amount_twd: e.twd, paid_by: e.by || '', note: e.note || '',
  } });
  function addExpense() {
    const a = expAmounts();
    if (!a.vnd && !a.twd) { toast('請先輸入金額'); $('#exp-amount').focus(); return; }
    const cat = $('#exp-cat').value; store.set('expCat', cat);
    const by = $('#exp-by').value.trim(); store.set('payer', by);
    const e = {
      id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: vnToday(), item: $('#exp-item').value.trim(),
      cat, vnd: a.vnd, twd: a.twd, by, note: '', created: new Date().toISOString(),
    };
    const local = store.get('expLocal', []); local.push(e); store.set('expLocal', local);
    TRIP.expenses.push(Object.assign({}, e, { pending: true }));
    queue(expenseOp(e));
    render(false);
    toast(`已記一筆 NT$ ${fmt(e.twd)}`);
  }
  function deleteExpense(id) {
    if (!id) return;
    const local = store.get('expLocal', []);
    const mine = local.find((e) => e.id === id);
    // 試算表上可能已經有這筆：不是這支手機記的、新增正在送出、或送出過但沒收到回應
    let mayExist = true;
    if (mine) {
      const adds = outbox().filter((op) => op.action === 'expense.add' && op.expense && op.expense.expense_id === id);
      mayExist = !mine.failed && (!adds.length || adds.some((op) => op.tries || op.opId === inflight));
      store.set('expLocal', local.filter((e) => e.id !== id));
      store.set('outbox', outbox().filter((op) => !(op.action === 'expense.add' && op.expense && op.expense.expense_id === id)));
    }
    if (mayExist) {
      const gone = store.get('expDel', []); if (!gone.includes(id)) { gone.push(id); store.set('expDel', gone); }
      queue({ action: 'expense.delete', id }); // 試算表找不到這筆時也會回 ok
    }
    TRIP.expenses = TRIP.expenses.filter((e) => e.id !== id);
    updateSyncUI();
    render(false);
    toast('已刪除');
  }
  function retryExpense(id) {
    const local = store.get('expLocal', []);
    const e = local.find((x) => x.id === id); if (!e) return;
    delete e.failed; store.set('expLocal', local);
    if (writeKey() === keyRejected) keyRejected = null;
    if (!outbox().some((op) => op.action === 'expense.add' && op.expense && op.expense.expense_id === id)) queue(expenseOp(e)); else flush();
    TRIP = build(tablesNow());
    render(false);
  }

  /* ---------- 與 Google Sheet 同步 ---------- */
  const tablesNow = () => (base ? base.tables : D.tables);
  function saveSyncSettings() {
    const u = $('#api-url'), k = $('#write-key');
    let keyChanged = false;
    if (k) { const v = k.value.trim(); keyChanged = v !== writeKey(); store.set('key', v); }
    if (u) {
      const v = u.value.trim();
      if (v !== apiUrl()) {
        if (v && !/^https:\/\/script\.google(usercontent)?\.com\//.test(v)) { toast('網址應該是 https://script.google.com/macros/s/…/exec'); }
        else { store.set('api', v); store.del('sheet'); base = null; sync.source = 'bundled'; sync.generated = D.generated; sync.error = ''; sync.writeError = ''; }
      }
    }
    if (keyChanged) { keyRejected = null; flush(); }
    updateSyncUI();
  }
  const dataErr = (msg) => Object.assign(new Error(msg), { data: true });
  async function getJSON(url) {
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    try { return await res.json(); } catch (e) {
      throw dataErr(res.ok ? '讀到的不是資料，請確認 Apps Script 部署的存取權是「所有人」' : `Google Sheet 回應 HTTP ${res.status}`);
    }
  }
  async function pull(manual) {
    const api = apiUrl();
    if (!api) { if (manual) toast('還沒設定 Google Sheet 網址'); updateSyncUI(); return; }
    if (navigator.onLine === false) { sync.error = '離線中，先用上次同步的資料'; updateSyncUI(); return; }
    if (sync.busy) { if (manual) toast('正在讀取，請稍候'); return; }
    sync.busy = true; lastPull = Date.now(); updateSyncUI();
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const seq = ackSeq;
        const key = writeKey();
        // 記帳不在公開的 GET 裡：有寫入密碼時另外用 POST expenses.list 讀
        const [j, ex] = await Promise.all([getJSON(api), key ? post({ action: 'expenses.list' }).catch(() => null) : null]);
        if (apiUrl() !== api) return; // 讀取途中換了網址
        if (!j || j.ok !== true || !j.tables || typeof j.tables !== 'object') throw dataErr('Google Sheet 回應錯誤：' + ((j && j.error) || '沒有資料'));
        if (flushing) { repull = true; return; } // 正在寫回：這份快照可能比寫回舊，寫完再讀
        if (ackSeq !== seq) continue;            // 讀取途中有寫回完成，重讀一次
        const tables = Object.assign({}, j.tables);
        if (ex && ex.ok && Array.isArray(ex.expenses)) tables.expenses = ex.expenses;
        else if (!Array.isArray(j.tables.expenses)) tables.expenses = (base && base.tables && base.tables.expenses) || [];
        const next = buildChecked(tables); // 先檢查再存，壞掉的內容不會蓋掉上次的資料
        if (!next) throw dataErr('試算表的「每日 days」分頁是空的或找不到');
        base = { generated: j.generated, tables };
        store.set('sheet', base);
        sync.source = 'sheet'; sync.generated = j.generated; sync.error = '';
        TRIP = next;
        reconcile(tables);
        if (!TRIP.days.some((d) => d.id === currentDay)) currentDay = TRIP.days[0].id;
        if (sheetWrap.hidden && !isTyping()) render(false);
        if (manual) toast('已從 Google Sheet 更新');
        return;
      }
    } catch (err) {
      const from = base ? '上次同步' : '內建';
      sync.error = err && err.data ? `${err.message}，先用${from}的資料` : `連不到 Google Sheet，先用${from}的資料`;
      if (manual) toast(sync.error);
    } finally { sync.busy = false; updateSyncUI(); flush(); }
  }
  /* 拿到一份與寫回一致的快照後，整理手機上的暫存：
     沒有待送的勾選 → 以試算表為準；已在試算表的記帳 → 不再暫存；遺失待送紀錄的暫存 → 補排一次（伺服器會略過重複） */
  function reconcile(tables) {
    const q = outbox();
    const pend = (action, f) => new Set(q.filter((o) => o.action === action).map(f));
    const pendCheck = pend('check', (o) => o.id), pendAdd = pend('expense.add', (o) => o.expense && o.expense.expense_id), pendDel = pend('expense.delete', (o) => o.id);
    const checks = store.get('checks', {});
    const keepChecks = Object.fromEntries(Object.entries(checks).filter(([id]) => pendCheck.has(id)));
    if (Object.keys(keepChecks).length !== Object.keys(checks).length) store.set('checks', keepChecks);
    const onServer = new Set((tables.expenses || []).map((r) => rowVal(r, 'expense_id')));
    const local = store.get('expLocal', []);
    const keep = local.filter((e) => !onServer.has(e.id));
    if (keep.length !== local.length) store.set('expLocal', keep);
    const gone = store.get('expDel', []);
    const stillGone = gone.filter((id) => onServer.has(id) || pendDel.has(id));
    if (stillGone.length !== gone.length) store.set('expDel', stillGone);
    for (const e of keep) if (!e.failed && !pendAdd.has(e.id)) queue(expenseOp(e));
    for (const id of stillGone) if (!pendDel.has(id)) queue({ action: 'expense.delete', id });
    TRIP = build(tables);
  }
  const isTyping = () => { const a = document.activeElement; return a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); };

  /* ---------- 待送（outbox）：每筆有 opId，送成功或確定失敗後依 opId 移除 ---------- */
  const newOpId = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function outbox() {
    const q = store.get('outbox', []);
    if (!Array.isArray(q)) return [];
    let fixed = false;
    for (const o of q) if (!o.opId) { o.opId = newOpId(); fixed = true; } // 舊版存下來的沒有 opId
    if (fixed) store.set('outbox', q);
    return q;
  }
  const dropOp = (opId) => store.set('outbox', outbox().filter((o) => o.opId !== opId));
  const markTry = (opId) => { const q = outbox(); const o = q.find((x) => x.opId === opId); if (o) { o.tries = (o.tries || 0) + 1; store.set('outbox', q); } };
  function queue(op) { op.opId = op.opId || newOpId(); const q = outbox(); q.push(op); store.set('outbox', q); updateSyncUI(); flush(); }
  async function post(body) {
    const payload = Object.assign({ key: writeKey() }, body); delete payload.opId; delete payload.tries;
    const res = await fetch(apiUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
    return res.json();
  }
  /* 暫時性的錯誤：保留這筆、停下來，稍後再送；其餘（找不到項目、金額空白…）是確定失敗 */
  const retryable = (j) => j.retry === true || /忙碌|稍後|timed? ?out|逾時|Service|服務|Too many|Address unavailable/i.test(String(j.error || ''));
  async function flush() {
    if (flushing || !apiUrl() || !writeKey() || navigator.onLine === false) return;
    if (keyRejected !== null && keyRejected === writeKey()) return;
    if (!outbox().length) return;
    flushing = true;
    let sent = 0, failed = 0, firstFail = '', stop = '';
    try {
      for (let op = outbox()[0]; op; op = outbox()[0]) {
        markTry(op.opId);
        inflight = op.opId;
        let j;
        try { j = await post(op); } finally { inflight = ''; }
        if (j && j.ok) { dropOp(op.opId); ack(op); sent++; continue; }
        const msg = String((j && j.error) || '沒有回應');
        if (/密碼/.test(msg)) { keyRejected = writeKey(); stop = msg; break; }
        if (!j || retryable(j)) { stop = `寫回 Google Sheet 暫時失敗（${msg}），稍後會再試`; break; }
        dropOp(op.opId); reject(op, msg); failed++; if (!firstFail) firstFail = msg;
      }
      if (stop) sync.writeError = stop;
      else if (failed) sync.writeError = `有 ${failed} 筆無法寫回：${firstFail}`;
      else if (sent) sync.writeError = '';
    } catch (err) {
      sync.writeError = '寫回 Google Sheet 失敗，連上網路後會再試';
    } finally {
      flushing = false;
      updateSyncUI();
      afterWrite(sent, failed);
      if (repull) { repull = false; pull(false); }
    }
  }
  const rowKey = (r, key) => Object.keys(r).find((k) => S.keyOf(k) === key || k === key);
  const rowVal = (r, key) => { const k = rowKey(r, key); return k ? String(r[k]).trim() : ''; };
  const setRowVal = (r, key, v) => { r[rowKey(r, key) || key] = v; };
  const pendingFor = (action, id) => outbox().some((o) => o.action === action && (o.id === id || (o.expense && o.expense.expense_id === id)));
  function ack(op) {
    ackSeq++;
    const tables = base ? base.tables : null;
    if (op.action === 'check') {
      // 只有暫存值跟這次寫回的一樣、而且後面沒有同一項待送時才清掉（勾了又取消時不會跳回去）
      const checks = store.get('checks', {});
      if (tables && checks[op.id] === op.done && !pendingFor('check', op.id)) { delete checks[op.id]; store.set('checks', checks); }
      if (tables) for (const r of tables.checklist || []) if (rowVal(r, 'check_id') === op.id) setRowVal(r, 'done', op.done ? 'TRUE' : 'FALSE');
    }
    if (op.action === 'expense.add') {
      const id = op.expense.expense_id;
      if (tables) {
        store.set('expLocal', store.get('expLocal', []).filter((e) => e.id !== id));
        tables.expenses = tables.expenses || [];
        if (!tables.expenses.some((r) => rowVal(r, 'expense_id') === id)) tables.expenses.push(Object.assign({}, op.expense, { created_at: new Date().toISOString(), source: 'app' }));
      }
      // 還沒有試算表快照時先留在手機上，下次讀到試算表再整理
    }
    if (op.action === 'expense.delete') {
      if (tables) tables.expenses = (tables.expenses || []).filter((r) => rowVal(r, 'expense_id') !== op.id);
      if (!pendingFor('expense.delete', op.id)) store.set('expDel', store.get('expDel', []).filter((id) => id !== op.id));
    }
    if (base) store.set('sheet', base);
    TRIP = build(tablesNow());
  }
  /* 確定失敗：把這筆在手機上的暫存還原（勾選回到試算表的值、記帳標成寫回失敗、刪除取消） */
  function reject(op, msg) {
    if (op.action === 'check') {
      const checks = store.get('checks', {});
      if (checks[op.id] === op.done && !pendingFor('check', op.id)) { delete checks[op.id]; store.set('checks', checks); }
    }
    if (op.action === 'expense.add') {
      store.set('expLocal', store.get('expLocal', []).map((e) => (e.id === op.expense.expense_id ? Object.assign({}, e, { failed: msg.slice(0, 80) }) : e)));
    }
    if (op.action === 'expense.delete' && !pendingFor('expense.delete', op.id)) {
      store.set('expDel', store.get('expDel', []).filter((id) => id !== op.id));
    }
    TRIP = build(tablesNow());
  }
  function afterWrite(sent, failed) {
    const n = $('#exp-sync');
    if (n) { const p = TRIP.expenses.filter((e) => e.pending && !e.failed).length, f = TRIP.expenses.filter((e) => e.failed).length; n.textContent = expSyncText(p, f) || (sent ? '已同步' : ''); }
    if (!(sent || failed) || !sheetWrap.hidden || isTyping()) return;
    // 預訂頁的「等待同步」標記、出發前頁被還原的勾選：表單是空的才重畫，免得清掉正在輸入的內容
    const idle = ['#exp-amount', '#exp-item'].every((s) => !($(s) && $(s).value));
    if ((view === 'book' && idle) || (view === 'prep' && failed)) render(false);
  }
  async function testKey() {
    if (!apiUrl()) { toast('先填資料 API 網址'); return; }
    if (!writeKey()) { toast('先填寫入密碼'); return; }
    try {
      const j = await post({ action: 'ping' });
      toast(j.ok ? '寫入密碼正確，可以同步' : j.error);
      if (j.ok) { keyRejected = null; if (/密碼/.test(sync.writeError)) sync.writeError = ''; updateSyncUI(); flush(); }
    } catch (err) { toast('連不到 Google Sheet，請檢查網址與網路'); }
  }
  /* 把幾句話接起來，每句只用一個句號（避免「。。」） */
  const sentences = (...parts) => parts.map((x) => String(x || '').trim().replace(/[。.]+$/, '')).filter(Boolean).join('。') + '。';
  function updateSyncUI() {
    const el = $('#sync-status'); if (!el) return;
    const q = outbox().length;
    const when = sync.generated ? new Date(sync.generated).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    let cls = 'ok', text;
    if (sync.busy) { cls = 'wait'; text = '正在從 Google Sheet 讀取'; }
    else if (!apiUrl()) { cls = ''; text = '目前使用網站內建的行程資料。部署 Apps Script 後把網址貼在下面，就會改讀你的 Google Sheet。'; }
    else if (sync.error || sync.writeError) { cls = 'err'; text = sentences(sync.error, sync.writeError); }
    else if (sync.source !== 'bundled') text = `資料來自 Google Sheet${when ? `，${when} 更新` : ''}`;
    else text = '已設定 Google Sheet，尚未同步';
    if (q && !sync.busy) { text = sentences(text, `${q} 筆變更等待寫回${writeKey() ? '' : '（需要寫入密碼）'}`); if (cls === 'ok') cls = 'wait'; }
    el.className = 'sync-note ' + cls;
    el.innerHTML = `<i></i><span>${esc(text)}</span>`;
  }

  /* ---------- PWA ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; updateInstallUI(); });
  function updateInstallUI() {
    const btn = $('#install-btn'); if (btn) btn.hidden = !deferredPrompt;
    const st = $('#sw-status'); if (!st) return;
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    const ctrl = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    const can = 'serviceWorker' in navigator && /^https?:$/.test(location.protocol);
    st.textContent = (standalone ? '目前以 App 模式開啟。' : '') + (ctrl ? '離線快取已啟用。' : can ? '離線快取準備中，重新開啟一次後即可離線瀏覽。' : '目前的開啟方式不支援離線快取；用 https 網址開啟才能安裝。');
  }
  async function cacheAllPhotos() {
    if (!('caches' in window)) { toast('這個瀏覽器不支援離線快取'); return; }
    const files = [...new Set(Object.values(TRIP.photos).filter((p) => p.file && !p.url).map((p) => `img/${p.file}-1200.webp`))];
    let ok = 0;
    toast(`下載中，共 ${files.length} 張`);
    try {
      const c = await caches.open('photos-large');
      for (const f of files) { try { const r = await fetch(f); if (r.ok) { await c.put(f, r); ok++; } } catch (err) { /* 略過單張失敗 */ } }
      toast(`已存好 ${ok} 張大張照片`);
    } catch (err) { toast('無法下載照片，請確認網路'); }
  }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').then(() => updateInstallUI()).catch(() => { /* 不支援時照常運作 */ }); });
  }
  window.addEventListener('online', () => { if (apiUrl()) pull(false); });

  /* ---------- 回到前景：iOS 主畫面 App 多半是從記憶體恢復、不會重新載入 ---------- */
  let shownDate = vnToday();
  function resume() {
    const t = vnToday();
    if (t !== shownDate) {
      // 過了午夜：跳到今天、重畫（封面的「第 N 天」也要更新）
      shownDate = t;
      const td = todayDay();
      if (td) { currentDay = td.id; if (/^#day-/.test(location.hash)) history.replaceState(null, '', '#day-' + td.id); }
      if (sheetWrap.hidden && showEl.hidden && !isTyping()) render(false);
    } else refreshMarks();
    if (apiUrl() && Date.now() - lastPull > 120000) pull(false); else flush();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) resume(); });
  setInterval(() => {
    if (document.hidden) return;
    if (vnToday() !== shownDate) { resume(); return; }
    refreshMarks(); // 只更新「下一站」與已過的標記，不重畫整頁
    if (outbox().length) flush();
  }, 60000);

  try { route(); } catch (err) {
    // 上次存的試算表內容讓畫面出錯：丟掉它改用內建資料，至少能打開「出發前」重新設定
    if (!base) throw err;
    store.del('sheet'); base = null; sync.source = 'bundled'; sync.generated = D.generated;
    TRIP = build(D.tables); currentDay = TRIP.days[0].id;
    route();
  }
  if (apiUrl()) pull(false); else flush();
})();
