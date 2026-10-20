/* Guarda la app y el lector del teléfono para que abran sin señal. Las llamadas a la API nunca se guardan. */
const V = 'escaner-bingo-v2';
const BASE = ['./', 'index.html', 'app.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
              'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /script\.google(usercontent)?\.com$/.test(u.hostname)) return;
  const propio = u.origin === location.origin;
  if (propio) {   // la app: primero la red (para tener lo último), si no hay señal lo guardado
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (/jsdelivr\.net$/.test(u.hostname)) {   // lector del teléfono y su idioma: guardado una vez
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { const c = n.clone(); caches.open(V).then(x => x.put(e.request, c)); return n; })));
  }
});
