/* 北越十日 2026 — 資料表定義與轉換
   Google Sheet 的每個分頁 = 一張資料表。分頁名稱與欄位標題都寫成「中文 代號」，
   程式只看最後的英文代號，所以中文可以自由修改。
   同一份定義給網站（瀏覽器）與 tools/（Node）共用。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TripSheet = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 列舉值：試算表顯示中文，程式用代號 ---------- */
  const ENUMS = {
    status: { booked: '已訂', confirm: '待確認', todo: '待訂', suggest: '建議' },
    region: { hanoi: '河內', sapa: '沙壩', ninhbinh: '寧平', transit: '交通' },
    type: {
      flight: '航班', train: '火車', bus: '巴士', car: '汽車', walk: '步行', food: '餐飲', sight: '景點',
      hotel: '住宿', boat: '遊船', spa: '放鬆', mountain: '登山', info: '資訊',
    },
    kind: { fact: '重點', warn: '提醒', todo: '待辦', info: '資訊' },
    per: { person: '每人', group: '整團' },
    mode: { walking: '步行', driving: '開車', transit: '大眾運輸', bicycling: '單車' },
    category: { transport: '交通', stay: '住宿', ticket: '門票', food: '餐飲', shopping: '購物', other: '其他' },
    focal: { center: '置中', top: '偏上', bottom: '偏下' },
    choice: { active: '出遊', relax: '放鬆' },
  };

  /* ---------- 資料表與欄位 ----------
     [代號, 中文, 型別]；型別：text（預設）、num、bool、list（逗號分隔）、enum:<名稱>、lines（換行分隔） */
  const TABLES = [
    { key: 'trip', label: '旅程設定', id: 'key', note: '整趟旅程的基本設定，一列一個項目。', cols: [
      ['key', '項目'], ['value', '內容'], ['note', '說明'],
    ] },
    { key: 'days', label: '每日', id: 'day_id', note: '一天一列。day_id 用 MMDD（例如 1105），其他分頁用它指到這一天。', cols: [
      ['day_id', '日期代號'], ['date', '日期'], ['weekday', '星期'], ['region', '地區', 'enum:region'], ['city', '城市'],
      ['title', '標題'], ['lead', '導言'], ['cover_photo', '封面照片'], ['stay_id', '當晚住宿'],
      ['route_mode', '路線交通方式', 'enum:mode'], ['route_stops', '路線地點', 'list'], ['plan_b', '備案'],
    ] },
    { key: 'items', label: '時間軸', id: 'item_id', note: '每天的行程項目。同一天依 sort、再依時間排序。', cols: [
      ['item_id', '項目代號'], ['day_id', '日期代號'], ['sort', '排序', 'num'], ['time', '開始'], ['end', '結束'],
      ['time_note', '時間備註'], ['type', '類型', 'enum:type'], ['title', '標題'], ['desc', '說明'], ['tip', '交通與提示'],
      ['status', '預訂狀態', 'enum:status'], ['unverified', '資訊未確認', 'bool'], ['place_ids', '地點', 'list'],
      ['food_ids', '餐廳', 'list'], ['photo', '照片'], ['travel_mode', '導航方式', 'enum:mode'],
    ] },
    { key: 'day_notes', label: '每日重點', id: 'note_id', note: 'kind=重點 會顯示成當天的資訊列；提醒／待辦／資訊 會顯示成提示框。', cols: [
      ['note_id', '代號'], ['day_id', '日期代號'], ['sort', '排序', 'num'], ['kind', '種類', 'enum:kind'],
      ['label', '標籤'], ['text', '內容'], ['status', '預訂狀態', 'enum:status'],
    ] },
    { key: 'options', label: '每日選項', id: 'option_id', note: '每天可以臨時決定的選項：出遊＝狀況好時可以訂的一日遊或活動；放鬆＝附近的餐廳與按摩。book_by 寫最晚要在什麼時候訂。', cols: [
      ['option_id', '代號'], ['day_id', '日期代號'], ['sort', '排序', 'num'], ['mode', '類型', 'enum:choice'], ['title', '標題'], ['desc', '說明'],
      ['book_by', '最晚預訂'], ['price', '價格'], ['duration', '時間長度'], ['links', '訂購連結', 'lines'], ['place_ids', '地點', 'list'],
      ['food_ids', '餐廳', 'list'], ['tips', '要先知道'],
    ] },
    { key: 'places', label: '地點', id: 'place_id', note: '景點、車站、住宿等所有地點。maps_query 是在 Google 地圖搜尋用的字串。', cols: [
      ['place_id', '地點代號'], ['region', '地區', 'enum:region'], ['category', '分類'], ['name_zh', '中文名稱'],
      ['name_vn', '越南文名稱'], ['address', '越南文地址'], ['maps_query', 'Google 地圖搜尋'], ['lat', '緯度', 'num'],
      ['lng', '經度', 'num'], ['hours', '開放時間'], ['price', '票價'], ['summary', '介紹'], ['tips', '小提醒'],
      ['photo', '照片'], ['status', '預訂狀態', 'enum:status'], ['unverified', '資訊未確認', 'bool'],
      ['used_on', '行程日'], ['sources', '資料來源', 'lines'], ['hidden', '不顯示', 'bool'],
    ] },
    { key: 'food', label: '餐廳', id: 'food_id', note: '推薦店家。michelin 留空代表未列入米其林指南。', cols: [
      ['food_id', '餐廳代號'], ['region', '地區', 'enum:region'], ['name_zh', '中文說明'], ['name_vn', '店名'],
      ['dish', '招牌菜'], ['address', '地址'], ['maps_query', 'Google 地圖搜尋'], ['hours', '營業時間'],
      ['price', '價位'], ['michelin', '米其林'], ['note', '備註'], ['best_day', '建議搭配'], ['photo', '照片'],
      ['status', '狀態', 'enum:status'], ['unverified', '資訊未確認', 'bool'], ['sources', '資料來源', 'lines'],
    ] },
    { key: 'dishes', label: '必吃', id: 'dish_id', note: '特色菜。越南文名稱會放大顯示給店家看。', cols: [
      ['dish_id', '菜色代號'], ['region', '地區', 'enum:region'], ['name_vn', '越南文'], ['name_zh', '中文'],
      ['desc', '介紹'], ['photo', '照片'],
    ] },
    { key: 'bookings', label: '訂位', id: 'booking_id', note: '請勿填寫票號、訂位代碼或付款資訊；本表內容會顯示在公開網站。訂購連結一行一個，格式「標籤 | https://網址」。', cols: [
      ['booking_id', '代號'], ['sort', '排序', 'num'], ['date', '日期'], ['when_label', '時間標示'], ['type', '類別'],
      ['title', '項目'], ['detail', '說明'], ['status', '狀態', 'enum:status'], ['next_action', '下一步'],
      ['links', '訂購連結', 'lines'], ['due', '建議完成日'], ['place_id', '地點'],
    ] },
    { key: 'stays', label: '住宿', id: 'stay_id', note: '每段住宿一列。', cols: [
      ['stay_id', '住宿代號'], ['name', '名稱'], ['dates', '日期'], ['check_in_out', '入住與退房'], ['address', '地址'],
      ['area', '位置'], ['status', '狀態', 'enum:status'], ['note', '備註'], ['place_id', '地點'],
      ['photo', '照片'], ['unverified', '資訊未確認', 'bool'], ['unverified_note', '未確認說明'],
    ] },
    { key: 'budget', label: '預算', id: 'budget_id', note: '每人估算金額（越南盾）。per=整團 代表整團共用、不乘人數。', cols: [
      ['budget_id', '代號'], ['sort', '排序', 'num'], ['category', '類別', 'enum:category'], ['item', '項目'],
      ['status', '狀態', 'enum:status'], ['per', '計算方式', 'enum:per'], ['low_vnd', '低估 VND', 'num'],
      ['high_vnd', '高估 VND', 'num'], ['note', '說明'],
    ] },
    { key: 'expenses', label: '記帳', id: 'expense_id', note: '旅途中的實際花費。網站的「記一筆」會自動新增到這裡，也可以直接在這裡輸入。', cols: [
      ['expense_id', '代號'], ['date', '日期'], ['item', '項目'], ['category', '類別', 'enum:category'],
      ['amount_vnd', '金額 VND', 'num'], ['amount_twd', '金額 TWD', 'num'], ['paid_by', '付款人'], ['note', '備註'],
      ['created_at', '建立時間'], ['source', '來源'],
    ] },
    { key: 'checklist', label: '行前清單', id: 'check_id', note: 'done 由網站勾選後自動寫回，也可以直接在這裡勾。', cols: [
      ['check_id', '代號'], ['group', '分組'], ['sort', '排序', 'num'], ['text', '項目'], ['note', '說明'],
      ['critical', '重要', 'bool'], ['done', '完成', 'bool'], ['done_at', '完成時間'],
    ] },
    { key: 'tips', label: '注意事項', id: 'tip_id', note: '同一個 section 的列會合成一組。', cols: [
      ['tip_id', '代號'], ['section', '主題'], ['sort', '排序', 'num'], ['text', '內容'], ['sources', '資料來源', 'lines'],
    ] },
    { key: 'contacts', label: '緊急聯絡', id: 'contact_id', note: '', cols: [
      ['contact_id', '代號'], ['name', '名稱'], ['number', '電話'], ['note', '說明'], ['unverified', '資訊未確認', 'bool'],
    ] },
    { key: 'phrases', label: '越南語', id: 'phrase_id', note: '', cols: [
      ['phrase_id', '代號'], ['vn', '越南文'], ['zh', '中文'],
    ] },
    { key: 'photos', label: '照片', id: 'photo_key', note: '照片檔放在網站 img/ 資料夾；url 有填時改用該網址。CC 授權照片必須保留作者與授權。', cols: [
      ['photo_key', '照片代號'], ['file', '檔名'], ['url', '外部網址'], ['credit', '作者'], ['license', '授權'],
      ['license_url', '授權連結'], ['source_url', '原始頁面'], ['alt', '照片說明'], ['focal', '裁切重心', 'enum:focal'],
    ] },
  ];
  const BY_KEY = Object.fromEntries(TABLES.map((t) => [t.key, t]));

  /* ---------- 名稱解析 ---------- */
  const keyOf = (s) => { const m = String(s || '').trim().match(/([a-z][a-z0-9_]*)\s*$/); return m ? m[1] : ''; };
  const header = (col) => `${col[1]} ${col[0]}`;
  const sheetName = (t) => `${t.label} ${t.key}`;

  /* ---------- 值的轉換 ---------- */
  const reverse = {};
  for (const [name, map] of Object.entries(ENUMS)) {
    reverse[name] = {};
    for (const [code, zh] of Object.entries(map)) { reverse[name][zh] = code; reverse[name][code] = code; }
  }
  function toValue(raw, type) {
    // 陣列（data.js 裡手寫的清單）：list、lines 直接逐項整理，其他型別接成字串
    if (Array.isArray(raw)) {
      if (type === 'list' || type === 'lines') return raw.map((x) => String(x == null ? '' : x).trim()).filter(Boolean);
      raw = raw.join(type === 'lines' ? '\n' : ', ');
    }
    const s = raw == null ? '' : String(raw).trim();
    if (!type || type === 'text') return s;
    if (type === 'num') { if (s === '') return null; const n = Number(s.replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : null; }
    if (type === 'bool') return /^(true|1|yes|y|v|是|✓|✔|x)$/i.test(s) && !/^false$/i.test(s);
    if (type === 'list') return s ? s.split(/[,，、\n]+/).map((x) => x.trim()).filter(Boolean) : [];
    if (type === 'lines') return s ? s.split(/\n+/).map((x) => x.trim()).filter(Boolean) : [];
    if (type.startsWith('enum:')) { const r = reverse[type.slice(5)]; return s ? (r[s] || s) : ''; }
    return s;
  }
  function toCell(v, type) {
    if (v == null) return '';
    if (type === 'bool') return !!v;
    if (type === 'list') return Array.isArray(v) ? v.join(', ') : String(v);
    if (type === 'lines') return Array.isArray(v) ? v.join('\n') : String(v);
    if (type && type.startsWith('enum:')) return v ? (ENUMS[type.slice(5)][v] || v) : '';
    return v;
  }

  /* 只接受 http(s) 網址，其餘（javascript: 等）一律不算網址 */
  const httpUrl = (u) => { const s = String(u == null ? '' : u).trim(); return /^https?:\/\/[^\s<>"]+$/i.test(s) ? s : ''; };

  /* 訂購連結：一行「標籤 | https://網址」；只有網址時用網域當標籤；沒有有效網址的行略過 */
  function parseLink(line) {
    const s = String(line || '').trim();
    let m = s.match(/^(.*?)\s*[|｜]\s*(\S+)\s*$/);
    if (m && !httpUrl(m[2])) m = null;
    const url = httpUrl(m ? m[2] : s);
    if (!url) return null;
    let label = m ? m[1].trim() : '';
    if (!label) { try { label = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { label = '連結'; } }
    return { label, url };
  }

  /* Commons 原始頁面網址 → 作品標題（File: 後面的檔名，底線換空白，去掉副檔名） */
  function commonsTitle(sourceUrl) {
    const s = String(sourceUrl || '');
    const i = s.indexOf('File:');
    if (i < 0) return '';
    let name = s.slice(i + 5).split(/[?#]/)[0];
    try { name = decodeURIComponent(name); } catch (e) { /* 編碼不完整時保留原字串 */ }
    return name.replace(/_/g, ' ').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  }

  /* 把一張表的原始列（物件，欄位名可能是「中文 代號」）轉成乾淨的物件陣列 */
  function normalizeRows(tableKey, rows) {
    const def = BY_KEY[tableKey]; if (!def || !Array.isArray(rows)) return [];
    const types = Object.fromEntries(def.cols.map((c) => [c[0], c[2] || 'text']));
    return rows.map((r) => {
      const o = {};
      for (const [k, v] of Object.entries(r)) { const key = keyOf(k) || k; if (key in types) o[key] = toValue(v, types[key]); }
      for (const c of def.cols) if (!(c[0] in o)) o[c[0]] = toValue('', c[2]);
      return o;
    }).filter((o) => o[def.id] !== '' && o[def.id] != null);
  }

  /* ---------- 資料表 → 網站使用的 TRIP 物件 ---------- */
  function tablesToTrip(tables, extra) {
    const T = {};
    for (const def of TABLES) T[def.key] = normalizeRows(def.key, (tables || {})[def.key] || []);
    const bySort = (a, b) => (a.sort ?? 999) - (b.sort ?? 999) || String(a.time || a.date || '').localeCompare(String(b.time || b.date || ''));
    const kv = Object.fromEntries(T.trip.map((r) => [r.key, r.value]));

    const photos = {};
    for (const p of T.photos) photos[p.photo_key] = { file: p.file, url: p.url, title: commonsTitle(p.source_url), credit: p.credit, license: p.license, licenseUrl: p.license_url, source: p.source_url, alt: p.alt, focal: p.focal || 'center' };

    const places = {};
    for (const p of T.places) places[p.place_id] = {
      name: p.name_zh, vn: p.name_vn, region: p.region, cat: p.category, addr: p.address, q: p.maps_query,
      lat: p.lat, lng: p.lng, hours: p.hours, price: p.price, summary: p.summary, tips: p.tips, photo: p.photo,
      status: p.status, unverified: p.unverified, days: p.used_on, src: p.sources, hidden: p.hidden,
    };

    const days = T.days.slice().sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
      const notes = T.day_notes.filter((n) => n.day_id === d.day_id).sort(bySort);
      const options = T.options.filter((o) => o.day_id === d.day_id).sort(bySort).map((o) => ({
        id: o.option_id, mode: o.mode || 'active', title: o.title, desc: o.desc, bookBy: o.book_by, price: o.price, duration: o.duration,
        links: o.links.map(parseLink).filter(Boolean), places: o.place_ids, food: o.food_ids, tips: o.tips,
      }));
      return {
        id: d.day_id, date: d.date, dow: d.weekday, region: d.region, city: d.city, title: d.title, lead: d.lead,
        cover: d.cover_photo, stay: d.stay_id, planB: d.plan_b,
        route: { mode: d.route_mode, stops: d.route_stops },
        facts: notes.filter((n) => n.kind === 'fact').map((n) => ({ k: n.label, v: n.text, status: n.status })),
        alerts: notes.filter((n) => n.kind !== 'fact').map((n) => ({ kind: n.kind, title: n.label, text: n.text })),
        items: T.items.filter((i) => i.day_id === d.day_id).sort(bySort).map((i) => ({
          id: i.item_id, time: i.time, end: i.end, timeNote: i.time_note, type: i.type || 'info', title: i.title,
          desc: i.desc, tip: i.tip, status: i.status, unverified: i.unverified, places: i.place_ids, food: i.food_ids,
          photo: i.photo, mode: i.travel_mode,
        })),
        options,
      };
    });

    const groups = [];
    for (const c of T.checklist.slice().sort(bySort)) {
      let g = groups.find((x) => x.group === c.group);
      if (!g) { g = { group: c.group, items: [] }; groups.push(g); }
      g.items.push({ id: c.check_id, text: c.text, note: c.note, critical: c.critical, done: c.done, doneAt: c.done_at });
    }
    const tips = [];
    for (const t of T.tips.slice().sort(bySort)) {
      let g = tips.find((x) => x.title === t.section);
      if (!g) { g = { title: t.section, items: [], src: [] }; tips.push(g); }
      g.items.push(t.text);
      for (const s of t.sources) if (!g.src.includes(s)) g.src.push(s);
    }

    return Object.assign({}, extra || {}, {
      meta: {
        title: kv.title || '北越十日', start: kv.start, end: kv.end, checked: kv.data_checked,
        rate: { vndPerTwd: Number(String(kv.rate_vnd_per_twd || '').replace(/[,\s]/g, '')) || 800, note: kv.rate_note || '' },
      },
      photos, places, days,
      food: T.food.map((f) => ({
        id: f.food_id, region: f.region, name: f.name_zh, vn: f.name_vn, dish: f.dish, addr: f.address, q: f.maps_query,
        hours: f.hours, price: f.price, michelin: f.michelin, note: f.note, day: f.best_day, photo: f.photo,
        status: f.status, unverified: f.unverified, src: f.sources,
      })),
      dishes: T.dishes.map((d) => ({ id: d.dish_id, region: d.region, vn: d.name_vn, zh: d.name_zh, desc: d.desc, photo: d.photo })),
      bookings: T.bookings.slice().sort(bySort).map((b) => ({
        id: b.booking_id, date: b.date, when: b.when_label, type: b.type, title: b.title, detail: b.detail,
        status: b.status, next: b.next_action, links: b.links.map(parseLink).filter(Boolean), due: b.due, place: b.place_id,
      })),
      stays: T.stays.map((s) => ({
        id: s.stay_id, name: s.name, dates: s.dates, inout: s.check_in_out, addr: s.address, area: s.area,
        status: s.status, note: s.note, place: s.place_id, photo: s.photo, unverified: s.unverified, unverifiedNote: s.unverified_note,
      })),
      budget: T.budget.slice().sort(bySort).map((b) => ({
        id: b.budget_id, cat: b.category, item: b.item, status: b.status, per: b.per || 'person', low: b.low_vnd, high: b.high_vnd, note: b.note,
      })),
      expenses: T.expenses.map((e) => ({
        id: e.expense_id, date: e.date, item: e.item, cat: e.category || 'other', vnd: e.amount_vnd, twd: e.amount_twd,
        by: e.paid_by, note: e.note, created: e.created_at,
      })),
      checklist: groups,
      tips,
      contacts: T.contacts.map((c) => ({ id: c.contact_id, name: c.name, num: c.number, note: c.note, unverified: c.unverified })),
      phrases: T.phrases.map((p) => ({ id: p.phrase_id, vn: p.vn, zh: p.zh })),
    });
  }

  /* ---------- 參照檢查（tools 與 Apps Script 都用得到同樣規則） ---------- */
  function checkTables(tables) {
    const T = {}; const problems = [];
    for (const def of TABLES) T[def.key] = normalizeRows(def.key, (tables || {})[def.key] || []);
    for (const def of TABLES) {
      const seen = new Set();
      for (const r of T[def.key]) { const id = r[def.id]; if (seen.has(id)) problems.push(`${def.label}：代號 ${id} 重複`); seen.add(id); }
      for (const c of def.cols) {
        if (!c[2] || !c[2].startsWith('enum:')) continue;
        const allowed = Object.keys(ENUMS[c[2].slice(5)]);
        for (const r of T[def.key]) if (r[c[0]] && !allowed.includes(r[c[0]])) problems.push(`${def.label} ${r[def.id]}：${c[1]}「${r[c[0]]}」不是可用的選項`);
      }
    }
    const ids = (k, f) => new Set(T[k].map((r) => r[f]));
    const days = ids('days', 'day_id'), places = ids('places', 'place_id'), food = ids('food', 'food_id');
    const photos = ids('photos', 'photo_key'), stays = ids('stays', 'stay_id');
    const need = (set, v, where) => { if (v && !set.has(v)) problems.push(`${where}：找不到「${v}」`); };
    for (const d of T.days) { need(stays, d.stay_id, `每日 ${d.day_id} 住宿`); need(photos, d.cover_photo, `每日 ${d.day_id} 封面照片`); d.route_stops.forEach((p) => need(places, p, `每日 ${d.day_id} 路線`)); }
    for (const i of T.items) {
      need(days, i.day_id, `時間軸 ${i.item_id} 日期`); need(photos, i.photo, `時間軸 ${i.item_id} 照片`);
      i.place_ids.forEach((p) => need(places, p, `時間軸 ${i.item_id} 地點`)); i.food_ids.forEach((f) => need(food, f, `時間軸 ${i.item_id} 餐廳`));
    }
    for (const n of T.day_notes) need(days, n.day_id, `每日重點 ${n.note_id} 日期`);
    for (const o of T.options) {
      need(days, o.day_id, `每日選項 ${o.option_id} 日期`);
      o.place_ids.forEach((p) => need(places, p, `每日選項 ${o.option_id} 地點`)); o.food_ids.forEach((f) => need(food, f, `每日選項 ${o.option_id} 餐廳`));
    }
    for (const p of T.places) need(photos, p.photo, `地點 ${p.place_id} 照片`);
    for (const f of T.food) need(photos, f.photo, `餐廳 ${f.food_id} 照片`);
    for (const d of T.dishes) need(photos, d.photo, `必吃 ${d.dish_id} 照片`);
    for (const b of T.bookings) need(places, b.place_id, `訂位 ${b.booking_id} 地點`);
    for (const s of T.stays) { need(places, s.place_id, `住宿 ${s.stay_id} 地點`); need(photos, s.photo, `住宿 ${s.stay_id} 照片`); }
    return problems;
  }

  return { ENUMS, TABLES, BY_KEY, keyOf, header, sheetName, toValue, toCell, normalizeRows, tablesToTrip, checkTables, httpUrl, parseLink, commonsTitle };
});
