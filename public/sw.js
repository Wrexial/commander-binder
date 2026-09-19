/* Service worker: makes the app installable and gives it an offline app shell.
 *
 * Deliberately small. It only touches same-origin requests, and never caches
 * API calls (/.netlify/functions/*), so authentication and collection data
 * always come from the network. Cross-origin requests (Scryfall, Clerk, fonts)
 * are left to the browser.
 */

const CACHE = 'lcc-shell-v1';
// Both pages are cached because Netlify serves the shell at `/` while a
// navigation request's URL may be either.
const SHELL = ['/', '/index.html', '/binder.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One missing key must not abort the whole install.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/.netlify/')) return;

  // Navigations: network-first, so a new deploy is picked up immediately, with
  // the cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    const shellUrl = new URL(request.url);
    const fallback = SHELL.includes(shellUrl.pathname) ? shellUrl.pathname : '/index.html';
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => {
            cache.put(fallback, copy.clone());
            if (fallback === '/index.html') cache.put('/', copy);
          });
          return response;
        })
        .catch(() =>
          caches.match(fallback).then((cached) => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  // Vite emits content-hashed assets and the icons are stable, so both are
  // safe to serve cache-first; anything else falls through to the network.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});
