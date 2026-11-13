// Service worker : application utilisable hors ligne.
// __V__ est remplacé par le numéro de version à chaque mise en ligne.
const V = '__V__';
const CACHE = 'dow-' + V;
const ASSETS = ['./', 'index.html', 'style.css?v=' + V, 'app.js?v=' + V, 'demo-data.js?v=' + V, 'sync.js?v=' + V, 'tools.js?v=' + V, 'manifest.webmanifest', 'icon.svg', 'jamhit-logo.svg', 'icon-192.png', 'icon-512.png', 'posters/demo-nova-station.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;   // l'API n'est jamais mise en cache
  // Réseau d'abord, sans le cache du navigateur (pour recevoir les mises à jour) ; cache en secours hors ligne.
  e.respondWith(
    fetch(req.url, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
