/* 北越十日 2026 — service worker
   頁面與程式：網路優先（3 秒逾時就用快取），所以更新會即時生效、離線也打得開。
     離線時先用最近一次從網路拿到的版本（RUNTIME），沒有才用安裝時存的版本（SHELL）。
   照片：快取優先（檔案不會變）。安裝時預先存好所有 600px 照片，沙壩山區沒訊號也看得到；
     大螢幕會要 1200px 的版本，離線又沒存過時改給 600px 的那張。
   Google Sheet 的資料由網頁自己存在 localStorage，這裡不快取 Apps Script 的回應。 */
const VERSION = 'v202610260117';
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './sheet.js',
  './data.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

try { importScripts('./data.js'); } catch (e) { /* 沒有資料檔時只快取外殼 */ }
const PHOTO_FILES = [...new Set(((self.TRIP_DATA && self.TRIP_DATA.tables && self.TRIP_DATA.tables.photos) || [])
  .map((r) => r.file).filter(Boolean))].map((f) => `./img/${f}-600.webp`);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // cache: 'reload' 繞過瀏覽器的 HTTP 快取（GitHub Pages 會快取 10 分鐘），確保存到的是這一版
    await c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.allSettled(PHOTO_FILES.map((f) => c.add(f)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME && k !== 'photos-large').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, 3000, './index.html'));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.includes('/img/')) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, 3000));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req));
  }
});

/* 1200px 的照片拿不到時，改用已經預先存好的 600px 版本 */
async function smallerPhoto(req) {
  const u = new URL(req.url);
  if (!/-1200\.webp$/.test(u.pathname)) return undefined;
  u.pathname = u.pathname.replace(/-1200\.webp$/, '-600.webp'); u.search = '';
  return caches.match(u.href, { ignoreSearch: true });
}

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      const copy = res.clone();
      caches.open(RUNTIME).then((c) => c.put(req, copy));
      return res;
    }
    return (await smallerPhoto(req)) || res;
  } catch (e) {
    return (await smallerPhoto(req)) || Response.error();
  }
}

/* 同一個檔案不同 ?v= 只留一份最新的：存進 RUNTIME 時去掉查詢字串 */
const bare = (req) => { const u = new URL(req.url); return u.origin + u.pathname; };
async function newestCopy(req, fallbackUrl) {
  const runtime = await caches.open(RUNTIME);
  const shell = await caches.open(SHELL);
  return (await runtime.match(bare(req))) || (await shell.match(req, { ignoreSearch: true }))
    || (fallbackUrl ? (await runtime.match(new URL(fallbackUrl, self.location).href)) || (await shell.match(fallbackUrl)) : undefined);
}

function networkFirst(req, ms, fallbackUrl) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => newestCopy(req, fallbackUrl).catch(() => undefined);
    const timer = setTimeout(() => {
      fromCache().then((r) => { if (r && !settled) { settled = true; resolve(r); } });
    }, ms);
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        clearTimeout(timer);
        if (res && res.ok && res.type === 'basic' && !res.redirected) {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(bare(req), copy));
        }
        if (!settled) { settled = true; resolve(res); }
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then((r) => { if (!settled) { settled = true; resolve(r || Response.error()); } });
      });
  });
}
