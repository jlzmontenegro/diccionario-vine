/* Service worker: funciona sin conexión tras la primera visita */
const VERSION = 'vine-v5';
const CORE = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/search-worker.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'data/index.json', 'data/bodies.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin || /\.pdf$/.test(new URL(req.url).pathname)) return;
  // Red primero para la app (actualizaciones), caché primero para los datos grandes
  const isData = /\/data\//.test(req.url);
  e.respondWith(
    (isData
      ? caches.match(req).then((hit) => hit || fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); return r; }))
      : fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); return r; }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))))
  );
});
