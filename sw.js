// Cache-busting service worker for OceanSkips.
//
// GitHub Pages sits behind a CDN that can serve a stale deploy for a few
// minutes after a push, and browsers (especially "add to home screen"
// bookmarks on mobile) cache the page even harder on top of that. This
// worker always tries the network first with cache: 'no-store' (bypassing
// the browser's own HTTP cache) so a push shows up as soon as the CDN
// clears, and only falls back to the last-seen copy when truly offline.
//
// Bump CACHE_VERSION whenever index.html changes — activate() deletes
// every cache that doesn't match the new name, so old bytes never linger.
const CACHE_VERSION = 'v5';
const CACHE_NAME = `oceanskips-${CACHE_VERSION}`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(event.request, { cache: 'no-store' });
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, fresh.clone());
      return fresh;
    } catch {
      return (await caches.match(event.request)) || Response.error();
    }
  })());
});
