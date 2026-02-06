const CACHE_NAME = 'mr-cache-v3';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/pwa-192.png',
  '/icons/pwa-512.png',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      if ('navigationPreload' in self.registration) {
        try { await self.registration.navigationPreload.enable(); } catch {}
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;
          const net = await fetch(req);
          const copy = net.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return net;
        } catch {
          return (await caches.match('/')) || (await caches.match('/index.html')) || (await caches.match('/offline.html'));
        }
      })()
    );
    return;
  }

  const connection = (self.navigator && (self.navigator).connection) || null;
  const preferCache = connection && /2g/i.test(connection.effectiveType || '');

  if (preferCache) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => caches.match('/offline.html'));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchAndCache = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached || caches.match('/offline.html'));
      return cached || fetchAndCache;
    })
  );
});
