#!/usr/bin/env node
/* 由 data.js 與 sheet.js 產生 seed.json：Apps Script 的「從網站匯入初始資料」會讀這個檔案，
   建立試算表的所有分頁（標題、資料、下拉選單、核取方塊、欄寬、預算公式）。
   用法：node tools/export_seed.js [輸出檔，預設 seed.json] */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.self = global;
require(path.join(ROOT, 'data.js'));
const S = require(path.join(ROOT, 'sheet.js'));
const D = self.TRIP_DATA.tables;

const WIDE = {
  lead: 360, desc: 380, tip: 320, summary: 380, tips: 320, note: 260, detail: 260, next_action: 320, plan_b: 320, text: 420,
  alt: 300, sources: 300, dish: 260, address: 260, maps_query: 240, hours: 220, price: 220, title: 220, name_zh: 170, name_vn: 190,
  name: 190, value: 300, area: 220, check_in_out: 160, unverified_note: 200, credit: 160, license_url: 200, source_url: 220,
  item: 180, vn: 220, zh: 150, number: 140, route_stops: 220, place_ids: 180, food_ids: 200,
  links: 320, book_by: 140, duration: 110,
};
const width = (key) => WIDE[key] || (key.endsWith('_id') ? 110 : 90);

function cell(v, type) {
  if (type === 'bool') return v === true || v === 'TRUE';
  if (type === 'num') return typeof v === 'number' ? v : v === '' || v == null ? '' : Number(String(v).replace(/,/g, '')) || '';
  const out = S.toCell(v, type);
  return out == null ? '' : String(out);
}

const tabs = S.TABLES.map((t) => ({
  key: t.key,
  name: S.sheetName(t),
  note: t.note || '',
  headers: t.cols.map(S.header),
  widths: t.cols.map((c) => width(c[0])),
  rows: (D[t.key] || []).map((r) => t.cols.map((c) => {
    if (t.key === 'trip' && c[0] === 'value' && r.key === 'rate_vnd_per_twd') return Number(r.value);
    return cell(r[c[0]], c[2]);
  })),
  columns: t.cols.map((c, i) => {
    const type = c[2] || 'text';
    const o = { col: i + 1 };
    if (type.startsWith('enum:')) o.options = Object.values(S.ENUMS[type.slice(5)]);
    if (type === 'bool') o.checkbox = true;
    o.format = type === 'num' ? (c[0] === 'lat' || c[0] === 'lng' ? '0.000000' : '#,##0') : type === 'bool' ? '' : '@';
    return o;
  }),
}));

const name = (k) => tabs.find((t) => t.key === k).name;
const q = (k) => `'${name(k)}'`;
const rateRow = 2 + D.trip.findIndex((r) => r.key === 'rate_vnd_per_twd');
const cats = Object.values(S.ENUMS.category);
const B = q('budget'), E = q('expenses');
const summary = {
  name: '預算總覽',
  cells: [
    ['A1', '預算總覽'],
    ['A2', '估算來自「預算 budget」分頁，實際花費來自「記帳 expenses」分頁，都是公式，新增列會自動算進來。黃色格子可以修改。'],
    ['A4', '人數'], ['B4', 1], ['C4', '每人估算會乘上這個數字，整團的項目不乘。'],
    ['A5', '匯率（1 TWD 換多少 VND）'], ['B5', `=${q('trip')}!B${rateRow}`], ['C5', '來自「旅程設定 trip」的 rate_vnd_per_twd。'],
    ['A7', '類別'], ['B7', '估算低（VND）'], ['C7', '估算高（VND）'], ['D7', '估算低（NT$）'], ['E7', '估算高（NT$）'], ['F7', '實際花費（NT$）'],
    ...cats.flatMap((cat, i) => {
      const r = 8 + i;
      const est = (col) => `=SUMIFS(${B}!$${col}:$${col},${B}!$C:$C,$A${r},${B}!$F:$F,"每人")*$B$4+SUMIFS(${B}!$${col}:$${col},${B}!$C:$C,$A${r},${B}!$F:$F,"整團")`;
      return [
        [`A${r}`, cat], [`B${r}`, est('G')], [`C${r}`, est('H')],
        [`D${r}`, `=IF($B$5=0,0,B${r}/$B$5)`], [`E${r}`, `=IF($B$5=0,0,C${r}/$B$5)`],
        [`F${r}`, `=SUMIFS(${E}!$F:$F,${E}!$D:$D,$A${r})+IF($B$5=0,0,SUMIFS(${E}!$E:$E,${E}!$D:$D,$A${r},${E}!$F:$F,"")/$B$5)`],
      ];
    }),
    [`A${8 + cats.length}`, '合計'],
    ...['B', 'C', 'D', 'E', 'F'].map((c) => [`${c}${8 + cats.length}`, `=SUM(${c}8:${c}${7 + cats.length})`]),
    [`A${10 + cats.length}`, '不含機票與已付款的住宿；實際花費的台幣金額以記帳時的匯率換算。'],
  ],
  input: 'B4',
  header: 'A7:F7',
  total: `A${8 + cats.length}:F${8 + cats.length}`,
  numbers: `B8:F${8 + cats.length}`,
};

const guide = [
  ['北越十日 2026 資料庫', 'title'],
  ['這份試算表是「北越十日」網站的資料來源。網站透過 Apps Script 讀取這裡的內容，改完之後，手機下次連網開啟網站就會更新。', ''],
  ['', ''],
  ['怎麼編輯', 'head'],
  ['1. 每個分頁是一張資料表，第一列是欄位名稱，格式是「中文 代號」。中文可以改，最後的英文代號不要改，網站靠代號找欄位。', ''],
  ['2. 分頁名稱也是「中文 代號」，例如「每日 days」。不要改英文代號，也不要刪掉分頁。', ''],
  ['3. 每一列的第一欄是代號（例如 day_id、place_id），不能重複。分頁之間用代號互相指到，例如「時間軸」的 place_ids 填「hoan-kiem, ngoc-son」。', ''],
  ['4. 有下拉選單的欄位請從選單選；核取方塊欄位直接勾選。', ''],
  ['5. 想新增一個景點：在「地點 places」加一列、取一個新的 place_id，再把它填進「時間軸 items」的 place_ids。', ''],
  ['6. 改完可以用選單「北越十日 → 檢查資料」確認代號都找得到。', ''],
  ['', ''],
  ['網站會寫回的分頁', 'head'],
  ['「行前清單 checklist」的完成與完成時間：在網站勾選時自動寫入。', ''],
  ['「記帳 expenses」：在網站按「記一筆」會新增一列；在這裡直接新增也會顯示在網站上（只有填了寫入密碼的手機讀得到）。', ''],
  ['「預算總覽」只在試算表裡用公式加總，網站不讀這一頁。', ''],
  ['', ''],
  ['隱私', 'head'],
  ['網站是公開的，這裡的內容會顯示在網站上。不要填機票票號、訂位代碼、護照號碼或付款資訊。', ''],
  ['例外：「記帳 expenses」不公開，網站要有寫入密碼才讀得到；「行前清單 checklist」的完成時間也不會傳到網站。', ''],
  ['「訂位 bookings」的訂購連結一行一個，格式「標籤 | https://網址」，網站會顯示成按鈕。', ''],
  ['', ''],
  ['連接網站', 'head'],
  ['Apps Script 的部署步驟在 GitHub repo 的 apps-script/README.md：設定 WRITE_KEY、部署成網頁應用程式，再把網址貼到網站「出發前 → Google Sheet 同步」。', ''],
  ['網站：https://zhonglunhuang.github.io/vietnam-trip-2026/', ''],
];

const seed = { generated: self.TRIP_DATA.generated, guide, summary, tabs };
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'seed.json');
fs.writeFileSync(out, JSON.stringify(seed));
console.log('seed.json', Math.round(fs.statSync(out).size / 1024), 'KB,', tabs.length, 'tabs');
