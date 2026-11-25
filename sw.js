// Service worker: la app se abre desde la memoria del móvil al instante (y sin cobertura).
// Los archivos de la app (FILES) salen SOLO de la caché de su versión, que se llena entera al instalarse: una versión
// nunca mezcla archivos de otra. La siguiente llega con su propio service worker. Sube este número al publicar cambios.
const CACHE = 'field-reports-v2.12.2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'vendor/pdf-lib.min.js',
  'js/app.js', 'js/api.js', 'js/config.js', 'js/db.js', 'js/english.js', 'js/fields.js', 'js/pdf.js',
  'js/photos.js', 'js/annot.js', 'js/annot-editor.js', 'js/annot-geom.js', 'js/icons.js', 'js/svg.js', 'js/geo.js', 'js/stickers.js', 'js/ai.js', 'js/i18n.js', 'js/i18n-dict.js', 'js/store.js', 'js/templates.js', 'js/ui.js', 'js/multi.js', 'js/merge.js', 'js/views/conflicts.js',
  'js/views/list.js', 'js/views/editor.js', 'js/views/outputs.js', 'js/views/admin.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
];
self.addEventListener('install', (e) => {
  // Los archivos nuevos de la v2.11/v2.12 pueden no estar publicados todavía: si faltan, no bloquean la instalación
  // (antes, un solo archivo inexistente hacía fallar la actualización y el móvil seguía con la versión vieja).
  const OPTIONAL = new Set(['js/multi.js', 'js/merge.js', 'js/views/conflicts.js']);
  const req = (f) => new Request(f, { cache: 'reload' });
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all([
    c.addAll(FILES.filter((f) => !OPTIONAL.has(f)).map(req)),
    ...[...OPTIONAL].map((f) => c.add(req(f)).catch(() => null)),
  ])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rutas de FILES (sin ?búsqueda), para reconocerlas en cada petición
const PRECACHED = new Set(FILES.map((f) => new URL(f, self.location).pathname));
const offline = () => new Response('Sin conexión', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // la API de Google va siempre por red
  const nav = e.request.mode === 'navigate'; // solo una navegación puede recibir index.html como respaldo
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (PRECACHED.has(url.pathname)) {
      // Archivo de la app: de la caché de esta versión, sin revalidarlo ni reescribirlo. Si faltara, de la red, sin guardarlo.
      if (hit) return hit;
      const res = await fetch(e.request).catch(() => null);
      return res || (nav && (await cache.match('index.html'))) || offline();
    }
    // Lo demás del mismo origen: copia local al instante + actualización en segundo plano
    const net = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (nav && (await cache.match('index.html'))) || offline();
  }));
});
