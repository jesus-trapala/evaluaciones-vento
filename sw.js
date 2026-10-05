/* Service worker: guarda SOLO los archivos de la app para que abra sin
   internet. Las evaluaciones y el borrador viven en localStorage y no pasan por aquí.
   Al publicar una versión nueva, sube el número de VERSION aquí Y el ?v=
   de los <script>/<link> en index.html. */

const VERSION = 'v4';
const CACHE = 'evaluaciones-app-' + VERSION;
const ARCHIVOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/logo.js',
  './js/pdf.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(llaves => Promise.all(llaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la red (para recibir siempre la versión más nueva); si no hay
// internet, lo guardado. Solo archivos propios de la app.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    // no-cache: siempre pregunta al servidor si hay versión nueva
    // (GitHub Pages guarda los archivos 10 minutos en el navegador).
    fetch(req, { cache: 'no-cache' })
      .then(resp => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
