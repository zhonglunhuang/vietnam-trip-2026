/**
 * 北越十日 2026 — Google Sheet 資料庫 API（綁定在試算表上的 Apps Script）
 *
 * 部署方式見 apps-script/README.md。重點：
 *   1. 專案設定 → 指令碼屬性：新增 WRITE_KEY（寫入密碼，網站勾清單、記帳時要輸入）
 *   2. 部署 → 新增部署作業 → 網頁應用程式；執行身分「我」、存取權「所有人」
 *
 * GET  <網址>                 回傳行程資料表（JSON）；不含「記帳」，行前清單的完成時間留白。
 *                              網址是公開的（網站的 config.js 也會放），所以這裡只放可以公開的內容。
 * POST <網址>  body 為 JSON 文字：{ key, action, ... }，key 是寫入密碼
 *      action = 'ping'                         檢查寫入密碼
 *      action = 'expenses.list'                讀取「記帳」所有列
 *      action = 'check'          { id, done }  勾選／取消行前清單
 *      action = 'expense.add'    { expense }   新增一筆記帳（expense_id 重複時略過）
 *      action = 'expense.delete' { id }        刪除一筆記帳（找不到時也回 ok）
 *   失敗時回 { ok: false, error }；暫時性的錯誤（忙碌、服務逾時）另外帶 retry: true，網站會保留這筆稍後重送。
 *
 * 分頁名稱與欄位標題都是「中文 代號」，程式只認最後的英文代號。
 */

var TZ = 'Asia/Ho_Chi_Minh';
var CONTENT = ['trip', 'days', 'items', 'day_notes', 'options', 'places', 'food', 'dishes', 'bookings', 'stays',
  'budget', 'expenses', 'checklist', 'tips', 'contacts', 'phrases', 'photos'];
/** 不經寫入密碼就能讀到的資料表：記帳只能用 POST expenses.list（要密碼）讀 */
var PRIVATE = ['expenses'];
var PUBLIC = CONTENT.filter(function (k) { return PRIVATE.indexOf(k) < 0; });

function keyOf_(s) {
  var m = String(s || '').trim().match(/([a-z][a-z0-9_]*)\s*$/);
  return m ? m[1] : '';
}

function sheetFor_(key) {
  var sheets = SpreadsheetApp.getActive().getSheets();
  for (var i = 0; i < sheets.length; i++) if (keyOf_(sheets[i].getName()) === key) return sheets[i];
  return null;
}

/** 讀一張表：以顯示值為準（與試算表上看到的一致），空白列略過 */
function readTable_(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  var keys = values[0].map(keyOf_);
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!String(row[0]).trim()) continue;
    var o = {};
    for (var c = 0; c < keys.length; c++) if (keys[c]) o[keys[c]] = row[c];
    rows.push(o);
  }
  return rows;
}

/** includePrivate=false：公開版本（網站 GET 用），不含記帳、清空行前清單的完成時間 */
function readAll_(includePrivate) {
  var tables = {};
  (includePrivate ? CONTENT : PUBLIC).forEach(function (key) {
    var sh = sheetFor_(key);
    tables[key] = sh ? readTable_(sh) : [];
  });
  if (!includePrivate) (tables.checklist || []).forEach(function (r) { if ('done_at' in r) r.done_at = ''; });
  return {
    ok: true,
    generated: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    tables: tables,
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  try {
    return json_(readAll_(false));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: '請求格式不是 JSON' });
  }
  var key = PropertiesService.getScriptProperties().getProperty('WRITE_KEY');
  if (!key) return json_({ ok: false, error: '尚未設定寫入密碼：請在 Apps Script 專案設定的指令碼屬性加入 WRITE_KEY' });
  if (req.key !== key) return json_({ ok: false, error: '寫入密碼不正確' });

  if (req.action === 'ping') return json_({ ok: true });
  if (req.action === 'expenses.list') {
    try {
      return json_(listExpenses_());
    } catch (err) {
      return json_({ ok: false, retry: true, error: String(err) });
    }
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ ok: false, retry: true, error: '試算表忙碌中，請稍後再試' });
  try {
    switch (req.action) {
      case 'check': return json_(setCheck_(String(req.id || ''), req.done === true));
      case 'expense.add': return json_(addExpense_(req.expense || {}));
      case 'expense.delete': return json_(deleteExpense_(String(req.id || '')));
      default: return json_({ ok: false, error: '不支援的動作：' + req.action });
    }
  } catch (err) {
    // 試算表服務的例外多半是暫時性的（逾時、服務錯誤），讓網站保留這筆稍後重送
    return json_({ ok: false, retry: true, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function listExpenses_() {
  var sh = sheetFor_('expenses');
  return {
    ok: true,
    generated: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    expenses: sh ? readTable_(sh) : [],
  };
}

/** 欄位代號 → 欄號（1 起算） */
function columns_(sheet) {
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var map = {};
  head.forEach(function (h, i) { var k = keyOf_(h); if (k) map[k] = i + 1; });
  return map;
}

function findRow_(sheet, col, id) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, col, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) return i + 2;
  return 0;
}

function setCheck_(id, done) {
  var sh = sheetFor_('checklist');
  if (!sh) return { ok: false, error: '找不到「行前清單 checklist」分頁' };
  var col = columns_(sh);
  var row = findRow_(sh, col.check_id, id);
  if (!row) return { ok: false, error: '找不到清單項目 ' + id };
  sh.getRange(row, col.done).setValue(done);
  if (col.done_at) sh.getRange(row, col.done_at).setValue(done ? Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') : '');
  return { ok: true, id: id, done: done };
}

function addExpense_(x) {
  var sh = sheetFor_('expenses');
  if (!sh) return { ok: false, error: '找不到「記帳 expenses」分頁' };
  var col = columns_(sh);
  var id = String(x.expense_id || '').trim() || ('e' + Utilities.getUuid().slice(0, 8));
  if (findRow_(sh, col.expense_id, id)) return { ok: true, id: id, duplicate: true };
  var vnd = Number(x.amount_vnd) || '';
  var twd = Number(x.amount_twd) || '';
  if (!vnd && !twd) return { ok: false, error: '金額不能是空的' };
  var row = new Array(sh.getLastColumn()).fill('');
  var put = function (k, v) { if (col[k]) row[col[k] - 1] = v; };
  put('expense_id', id);
  put('date', String(x.date || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')));
  put('item', String(x.item || '').slice(0, 200));
  put('category', String(x.category || '其他'));
  put('amount_vnd', vnd);
  put('amount_twd', twd);
  put('paid_by', String(x.paid_by || '').slice(0, 50));
  put('note', String(x.note || '').slice(0, 300));
  put('created_at', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'));
  put('source', 'app');
  sh.appendRow(row);
  return { ok: true, id: id };
}

function deleteExpense_(id) {
  var sh = sheetFor_('expenses');
  if (!sh) return { ok: false, error: '找不到「記帳 expenses」分頁' };
  var row = findRow_(sh, columns_(sh).expense_id, id);
  if (!row) return { ok: true, id: id, missing: true };
  sh.deleteRow(row);
  return { ok: true, id: id };
}

/* ---------- 試算表選單 ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('北越十日')
    .addItem('從網站匯入初始資料', 'setupFromWebsite')
    .addSeparator()
    .addItem('檢查資料（代號與選項）', 'checkData')
    .addItem('預覽網站讀到的資料筆數', 'showCounts')
    .addToUi();
}

/* ---------- 第一次設定：從網站的 seed.json 建立所有分頁 ---------- */
var SEED_URL = 'https://zhonglunhuang.github.io/vietnam-trip-2026/seed.json';

function sheetNamed_(ss, name, index) {
  var key = keyOf_(name);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n === name || (key && keyOf_(n) === key)) return sheets[i];
  }
  return ss.insertSheet(name, Math.min(index, sheets.length));
}

function ensureSize_(sh, rows, cols) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
}

function setupFromWebsite() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  var hasData = ss.getSheets().some(function (s) { return keyOf_(s.getName()) && s.getLastRow() > 1; });
  if (hasData) {
    var ans = ui.alert('匯入會覆蓋現有資料',
      '試算表裡已經有資料分頁。繼續匯入會用網站上的版本覆蓋全部分頁，記帳與行前清單的勾選也會被清掉。確定要繼續嗎？', ui.ButtonSet.YES_NO);
    if (ans !== ui.Button.YES) return;
  }
  var seed = JSON.parse(UrlFetchApp.fetch(SEED_URL).getContentText());

  var guide = sheetNamed_(ss, '說明', 0);
  guide.clear();
  guide.getRange(1, 1, seed.guide.length, 1).setValues(seed.guide.map(function (g) { return [g[0]]; })).setWrap(true).setVerticalAlignment('top');
  seed.guide.forEach(function (g, i) {
    var r = guide.getRange(i + 1, 1);
    if (g[1] === 'title') r.setFontSize(14).setFontWeight('bold');
    if (g[1] === 'head') r.setFontWeight('bold');
  });
  guide.setColumnWidth(1, 820);

  seed.tabs.forEach(function (t, i) {
    var sh = sheetNamed_(ss, t.name, i + 2);
    var ncol = t.headers.length;
    var nrow = t.rows.length + 300;
    sh.clear();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
    ensureSize_(sh, nrow + 1, ncol);
    t.columns.forEach(function (c) {
      var rng = sh.getRange(2, c.col, nrow, 1);
      if (c.format) rng.setNumberFormat(c.format);
      if (c.options) rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(c.options, true).setAllowInvalid(false).build());
    });
    sh.getRange(1, 1, 1, ncol).setValues([t.headers]).setFontWeight('bold').setBackground('#E6E9F2').setWrap(true).setVerticalAlignment('middle');
    // 先插核取方塊再寫值：insertCheckboxes() 會把範圍內的格子全部設成 FALSE，順序反過來會清掉 seed 裡的 TRUE
    t.columns.forEach(function (c) { if (c.checkbox) sh.getRange(2, c.col, t.rows.length || 1, 1).insertCheckboxes(); });
    if (t.rows.length) sh.getRange(2, 1, t.rows.length, ncol).setValues(t.rows).setVerticalAlignment('top');
    t.widths.forEach(function (w, j) { sh.setColumnWidth(j + 1, w); });
    sh.setFrozenRows(1);
    sh.setFrozenColumns(1);
    if (t.note) sh.getRange(1, 1).setNote(t.note);
  });

  var sm = seed.summary;
  var sum = sheetNamed_(ss, sm.name, 1);
  sum.clear();
  sm.cells.forEach(function (c) {
    var r = sum.getRange(c[0]);
    if (typeof c[1] === 'string' && c[1].charAt(0) === '=') r.setFormula(c[1]); else r.setValue(c[1]);
  });
  sum.getRange('A1').setFontSize(14).setFontWeight('bold');
  sum.getRange('A2:F2').merge().setWrap(true);
  sum.getRange(sm.input).setBackground('#FFF2CC');
  sum.getRange(sm.header).setFontWeight('bold').setBackground('#E6E9F2');
  sum.getRange(sm.total).setFontWeight('bold');
  sum.getRange(sm.numbers).setNumberFormat('#,##0;(#,##0);"-"');
  sum.getRange('B5').setNumberFormat('#,##0');
  sum.setColumnWidth(1, 200);
  for (var col = 2; col <= 6; col++) sum.setColumnWidth(col, 130);

  ss.getSheets().forEach(function (s) {
    var n = s.getName();
    if (!keyOf_(n) && n !== '說明' && n !== sm.name && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  ui.alert('匯入完成', '已建立 ' + seed.tabs.length + ' 個資料分頁。接著請在 Apps Script 設定 WRITE_KEY 並部署成網頁應用程式（步驟在「說明」分頁）。', ui.ButtonSet.OK);
}

function showCounts() {
  var t = readAll_(true).tables;
  var lines = Object.keys(t).map(function (k) {
    return k + '：' + t[k].length + ' 列' + (PRIVATE.indexOf(k) >= 0 ? '（不公開，網站要有寫入密碼才讀得到）' : '');
  });
  SpreadsheetApp.getUi().alert('網站會讀到的資料', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

/** 檢查重複代號與找不到的參照（例如時間軸指到不存在的地點） */
function checkData() {
  var t = readAll_(true).tables;
  var problems = [];
  var ids = function (key, field) {
    var s = {};
    (t[key] || []).forEach(function (r) {
      var v = String(r[field] || '').trim();
      if (s[v]) problems.push(key + '：代號 ' + v + ' 重複');
      s[v] = true;
    });
    return s;
  };
  var days = ids('days', 'day_id'), places = ids('places', 'place_id'), food = ids('food', 'food_id');
  var photos = ids('photos', 'photo_key'), stays = ids('stays', 'stay_id');
  ['items', 'day_notes', 'options', 'dishes', 'bookings', 'budget', 'expenses', 'checklist', 'tips', 'contacts', 'phrases'].forEach(function (k) {
    var idKey = { items: 'item_id', day_notes: 'note_id', options: 'option_id', dishes: 'dish_id', bookings: 'booking_id', budget: 'budget_id',
      expenses: 'expense_id', checklist: 'check_id', tips: 'tip_id', contacts: 'contact_id', phrases: 'phrase_id' }[k];
    ids(k, idKey);
  });
  var list = function (v) { return String(v || '').split(/[,，、\n]+/).map(function (x) { return x.trim(); }).filter(String); };
  var need = function (set, v, where) { v = String(v || '').trim(); if (v && !set[v]) problems.push(where + '：找不到「' + v + '」'); };
  (t.days || []).forEach(function (d) {
    need(stays, d.stay_id, '每日 ' + d.day_id + ' 住宿');
    need(photos, d.cover_photo, '每日 ' + d.day_id + ' 封面照片');
    list(d.route_stops).forEach(function (p) { need(places, p, '每日 ' + d.day_id + ' 路線'); });
  });
  (t.items || []).forEach(function (i) {
    need(days, i.day_id, '時間軸 ' + i.item_id + ' 日期');
    need(photos, i.photo, '時間軸 ' + i.item_id + ' 照片');
    list(i.place_ids).forEach(function (p) { need(places, p, '時間軸 ' + i.item_id + ' 地點'); });
    list(i.food_ids).forEach(function (f) { need(food, f, '時間軸 ' + i.item_id + ' 餐廳'); });
  });
  (t.day_notes || []).forEach(function (n) { need(days, n.day_id, '每日重點 ' + n.note_id + ' 日期'); });
  (t.options || []).forEach(function (o) {
    need(days, o.day_id, '每日選項 ' + o.option_id + ' 日期');
    list(o.place_ids).forEach(function (p) { need(places, p, '每日選項 ' + o.option_id + ' 地點'); });
    list(o.food_ids).forEach(function (f) { need(food, f, '每日選項 ' + o.option_id + ' 餐廳'); });
  });
  (t.places || []).forEach(function (p) { need(photos, p.photo, '地點 ' + p.place_id + ' 照片'); });
  (t.food || []).forEach(function (f) { need(photos, f.photo, '餐廳 ' + f.food_id + ' 照片'); });
  (t.bookings || []).forEach(function (b) { need(places, b.place_id, '訂位 ' + b.booking_id + ' 地點'); });
  var ui = SpreadsheetApp.getUi();
  ui.alert(problems.length ? '發現 ' + problems.length + ' 個問題' : '資料檢查通過',
    problems.length ? problems.slice(0, 40).join('\n') : '代號沒有重複，參照都找得到。', ui.ButtonSet.OK);
}
