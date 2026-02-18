// BUMP THIS VERSION every time you deploy an update
const APP_VERSION = '2.0.0';
const CACHE_NAME = 'mon-assistant-' + APP_VERSION;

const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap'
];

// Install — cache static assets, skip waiting immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // Activate new SW immediately
  );
});

// Activate — delete ALL old caches, claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // Take control of all pages immediately
  );
  // Notify all open tabs that a new version is active
  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION }));
  });
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls — always network, never cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML pages (index.html, /) — NETWORK FIRST
  // This ensures updates are always picked up on iOS
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Got fresh version from network — cache it
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Offline — serve cached version
          return caches.match(event.request) || caches.match('/index.html');
        })
    );
    return;
  }

  // Static assets (fonts, icons, manifest) — cache first for speed
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => caches.match('/index.html'))
  );
});

// Listen for manual update check from the app
self.addEventListener('message', event => {
  if (event.data === 'CHECK_UPDATE') {
    self.registration.update();
  }
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
