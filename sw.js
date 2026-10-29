/* ブラッピー — 画面の部品を端末に持つ（Service Worker。261022）。
 *
 * 電波の悪い所で開くと、app.js・style.css・templates.html・銀行のマスタ・LIFF の SDK を取るだけで数秒かかっていた。
 * 2回目からは端末の控えを先に使い、裏で最新を取って次回に使う（stale-while-revalidate）。
 * ページ本体（index.html・apply.html）は先に通信し、4秒返らなければ控えを使う。
 * 🔴 API（script.google.com への POST）は触らない。LINE のログイン（access.line.me）も触らない。
 * 🔴 画面と GAS を同時に変えるときは、1回前の画面が新しい GAS でも動くようにしておく（控えが1回分古いことがある）。
 */
'use strict';
const VERSION = 'brappy-v6';   /* 261029 登録画面を直接開くときは登録画面の枠を出す */
const SELF = self.location.origin;
const ASSET = /\.(js|css|html|json|png|jpg|webp|svg|woff2?)$/;
const SDK = 'https://static.line-scdn.net';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === SELF) { e.respondWith(pageFirstNetwork(req)); return; }
  if ((url.origin === SELF && ASSET.test(url.pathname)) || url.origin === SDK) e.respondWith(staleWhileRevalidate(req));
});

/* 控えの鍵は URL の ? より前（LIFF が ?liff.state=… を付けて開くため） */
const keyOf = req => { const u = new URL(req.url); return u.origin + u.pathname; };

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const key = keyOf(req);
  const cached = await cache.match(key);
  const fresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone());
    return res;
  }).catch(() => null);
  if (cached) return cached;
  const res = await fresh;
  return res || Response.error();
}

async function pageFirstNetwork(req) {
  const cache = await caches.open(VERSION);
  const key = keyOf(req);
  const timer = new Promise(ok => setTimeout(() => ok(null), 4000));
  const net = fetch(req).then(res => { if (res && res.ok) cache.put(key, res.clone()); return res; }).catch(() => null);
  const res = await Promise.race([net, timer]);
  if (res) return res;
  const cached = await cache.match(key);
  if (cached) return cached;
  return (await net) || Response.error();
}
