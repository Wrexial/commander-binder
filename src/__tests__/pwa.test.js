import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerServiceWorker } from '../pwa.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('registerServiceWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is a no-op when disabled', () => {
    const register = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    expect(registerServiceWorker({ enabled: false })).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('is a no-op when the browser has no service worker support', () => {
    vi.stubGlobal('navigator', {});
    expect(registerServiceWorker({ enabled: true })).toBe(false);
  });

  it('registers /sw.js once the document is ready', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });

    expect(registerServiceWorker({ enabled: true })).toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js');
  });
});

describe('PWA artifacts', () => {
  it('links the manifest and Apple install metadata from index.html', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');

    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('apple-mobile-web-app-title');
  });

  it('ships a standalone manifest whose any + maskable icons exist', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));

    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      expect(existsSync(resolve(root, 'public', icon.src.replace(/^\//, '')))).toBe(true);
    }
  });

  it('ships a service worker that caches the shell but never the API', () => {
    const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8');

    expect(sw).toContain("addEventListener('fetch'");
    expect(sw).toContain('/.netlify/');
    expect(sw).toContain("addEventListener('install'");
  });
});

const swSource = readFileSync(resolve(root, 'public/sw.js'), 'utf8');

/** Run the classic service-worker script against fakes, returning its listeners. */
function loadServiceWorker({ caches, fetch }) {
  const listeners = {};
  const self = {
    location: { origin: 'https://legendex.test' },
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  new Function('self', 'caches', 'fetch', swSource)(self, caches, fetch);
  return listeners;
}

function fakeResponse() {
  const response = { ok: true, clone: () => response };
  return response;
}

function fakeCaches({ match } = {}) {
  const put = vi.fn(() => Promise.resolve());
  const add = vi.fn(() => Promise.resolve());
  return {
    open: vi.fn(() => Promise.resolve({ put, add })),
    match: vi.fn((key) => Promise.resolve(match ? match(key) : undefined)),
    keys: vi.fn(() => Promise.resolve([])),
    delete: vi.fn(() => Promise.resolve(true)),
    put,
  };
}

/** A minimal FetchEvent. `respondWith` is spied so the response promise is readable. */
function fetchEvent(request) {
  return { request, respondWith: vi.fn() };
}

function request(path, overrides = {}) {
  return { method: 'GET', url: `https://legendex.test${path}`, ...overrides };
}

describe('service worker routing', () => {
  it('ignores non-GET, cross-origin and function requests', () => {
    const listeners = loadServiceWorker({ caches: fakeCaches(), fetch: vi.fn() });

    const post = fetchEvent({ method: 'POST', url: 'https://legendex.test/assets/x.js' });
    const cross = fetchEvent({ method: 'GET', url: 'https://api.scryfall.com/cards' });
    const fn = fetchEvent(request('/.netlify/functions/owned-cards'));

    for (const event of [post, cross, fn]) listeners.fetch(event);

    expect(post.respondWith).not.toHaveBeenCalled();
    expect(cross.respondWith).not.toHaveBeenCalled();
    expect(fn.respondWith).not.toHaveBeenCalled();
  });

  it('serves navigations network-first and caches the shell', async () => {
    const caches = fakeCaches();
    const response = fakeResponse();
    const listeners = loadServiceWorker({ caches, fetch: vi.fn(() => Promise.resolve(response)) });

    const event = fetchEvent(request('/', { mode: 'navigate' }));
    listeners.fetch(event);

    await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(response);
    await vi.waitFor(() => expect(caches.put).toHaveBeenCalled());
  });

  it('falls back to the cached shell when the network fails', async () => {
    const cached = fakeResponse();
    const caches = fakeCaches({ match: () => cached });
    const fetch = vi.fn(() => Promise.reject(new Error('offline')));
    const listeners = loadServiceWorker({ caches, fetch });

    const event = fetchEvent(request('/binder.html', { mode: 'navigate' }));
    listeners.fetch(event);

    await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(cached);
  });

  it('serves hashed assets cache-first and stores a miss', async () => {
    const caches = fakeCaches();
    const response = fakeResponse();
    const listeners = loadServiceWorker({ caches, fetch: vi.fn(() => Promise.resolve(response)) });

    const event = fetchEvent(request('/assets/main-abc.js'));
    listeners.fetch(event);

    await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(response);
    await vi.waitFor(() => expect(caches.put).toHaveBeenCalled());
  });

  it('serves a cached asset without hitting the network', async () => {
    const cached = fakeResponse();
    const caches = fakeCaches({ match: () => cached });
    const fetch = vi.fn();
    const listeners = loadServiceWorker({ caches, fetch });

    const event = fetchEvent(request('/assets/main-abc.js'));
    listeners.fetch(event);

    await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(cached);
    expect(fetch).not.toHaveBeenCalled();
  });
});
