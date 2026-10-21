// Service worker: cache app shell agar bisa dibuka offline.
// Hanya menyentuh cache berawalan "rpgtl-shell-" dan hanya request same-origin.
// Panggilan ke provider LLM (cross-origin) tidak pernah dicegat.
const VERSION = 'rpgtl-shell-v19';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'lang-vocab.js', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rpgtl-shell-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Halaman: jaringan dulu, cache bila offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('index.html', copy));
        return res;
      }).catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Aset: jaringan dulu supaya deploy baru langsung terpakai, cache bila offline.
  e.respondWith(
    caches.open(VERSION).then(async (c) => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        return (await c.match(req)) || Response.error();
      }
    })
  );
});
