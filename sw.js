// Service worker: la app se abre desde la memoria del móvil al instante (y sin cobertura),
// y se actualiza sola en segundo plano. Sube este número al publicar cambios.
const CACHE = 'field-reports-v2.3.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'vendor/pdf-lib.min.js',
  'js/app.js', 'js/api.js', 'js/config.js', 'js/db.js', 'js/english.js', 'js/fields.js', 'js/pdf.js',
  'js/photos.js', 'js/annot.js', 'js/icons.js', 'js/store.js', 'js/templates.js', 'js/ui.js',
  'js/views/list.js', 'js/views/editor.js', 'js/views/outputs.js', 'js/views/admin.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // la API de Google va siempre por red
  // Copia local al instante + actualización en segundo plano
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (await cache.match('index.html')) || new Response('Sin conexión', { status: 503 });
  }));
});
