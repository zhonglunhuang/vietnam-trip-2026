#!/usr/bin/env node
/* 從 Google Sheet（Apps Script 網頁應用程式）抓最新資料，更新內建快照 data.js 與 seed.json。
   網站平常就會直接讀試算表；這個工具是讓離線備援與第一次開啟時看到的內容也跟上。
   用法：node tools/pull_sheet.js [API 網址]；省略網址時用 config.js 的 sheetApi */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const cfgCtx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), cfgCtx);
const url = process.argv[2] || (cfgCtx.window.TRIP_CONFIG || {}).sheetApi;
if (!url) { console.error('請提供 Apps Script 網址，或先填 config.js 的 sheetApi'); process.exit(1); }

global.self = global;
require(path.join(ROOT, 'data.js'));
const overview = self.TRIP_DATA.overview;

(async () => {
  const res = await fetch(url, { redirect: 'follow' });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || '讀取失敗');
  const S = require(path.join(ROOT, 'sheet.js'));
  const problems = S.checkTables(j.tables);
  if (problems.length) console.warn('試算表有 ' + problems.length + ' 個參照問題（仍會寫入）：\n  ' + problems.slice(0, 20).join('\n  '));
  const head = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8').split('self.TRIP_DATA =')[0];
  const out = { generated: j.generated, tables: j.tables, overview };
  fs.writeFileSync(path.join(ROOT, 'data.js'), head + 'self.TRIP_DATA = ' + JSON.stringify(out, null, 1) + ';\n');
  console.log('data.js 已更新（' + j.generated + '）');
  execFileSync('node', [path.join(__dirname, 'export_seed.js')], { stdio: 'inherit' });
})().catch((e) => { console.error(e.message); process.exit(1); });
