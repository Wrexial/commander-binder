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
