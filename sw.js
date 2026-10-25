/* Cartella Salute — service worker
   Ad ogni aggiornamento dell'app aumentare CACHE, altrimenti il telefono vede la versione vecchia. */
const CACHE = 'cartella-salute-v2';
const FILE = ['./', 'index.html', 'style.css', 'refs.js', 'db.js', 'app.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const ESTERNI = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'tessdata.projectnaptha.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && !k.startsWith('esterni-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Librerie esterne (lettore PDF e OCR): una volta scaricate restano disponibili offline
  if (ESTERNI.includes(u.hostname)) {
    e.respondWith(caches.open('esterni-v1').then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
    return;
  }
  if (u.origin !== location.origin) return;
  // App: prima la rete (così prendi gli aggiornamenti), se manca internet la copia salvata
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
