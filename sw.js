// Service worker: guarda la app en el dispositivo para que abra sin cobertura.
// Sube este número cada vez que publiques cambios para forzar la actualización.
const CACHE = 'field-reports-v2.0.1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'vendor/pdf-lib.min.js',
  'js/app.js', 'js/api.js', 'js/config.js', 'js/db.js', 'js/english.js', 'js/fields.js', 'js/pdf.js',
  'js/photos.js', 'js/store.js', 'js/templates.js', 'js/ui.js',
  'js/views/list.js', 'js/views/editor.js', 'js/views/outputs.js', 'js/views/admin.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // la API de Google va siempre por red
  // Red primero (para recibir actualizaciones), copia local si no hay cobertura
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
