// src/utils/imageCache.js
/**
 * Session-wide image cache keyed by URL.
 *
 * The <img> element is retained in the map from the moment it is created, so:
 *  - an in-flight download is never abandoned when a tooltip closes, and
 *  - every later request for the same URL reuses the same (already decoded)
 *    element instead of hitting the network again.
 *
 * Scryfall's image CDN serves `Cache-Control: public, max-age=31556952`, so
 * the browser HTTP cache covers reloads; this map covers repeats within a page
 * session, including quick hovers that never finish loading before being hidden.
 */

export const IMAGE_CACHE_LIMIT = 150;

/** @type {Map<string, HTMLImageElement>} */
const cache = new Map();

/**
 * Return the cached <img> for a URL, creating and starting it on first use.
 * The same element is returned for repeated calls with the same URL.
 * @param {string} url
 * @returns {HTMLImageElement|null}
 */
export function getImage(url) {
  if (!url) return null;

  const existing = cache.get(url);
  if (existing) {
    // Refresh LRU ordering so frequently used images survive eviction.
    cache.delete(url);
    cache.set(url, existing);
    return existing;
  }

  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
  cache.set(url, img);

  if (cache.size > IMAGE_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }

  return img;
}

/**
 * Resolve once the image for `url` has loaded (or null if it failed).
 * @param {string} url
 * @returns {Promise<HTMLImageElement|null>}
 */
export function loadImage(url) {
  const img = getImage(url);
  if (!img) return Promise.resolve(null);

  if (img.complete) {
    return Promise.resolve(img.naturalWidth > 0 ? img : null);
  }

  return new Promise((resolve) => {
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", () => resolve(null), { once: true });
  });
}

/** Number of cached images (mainly for tests). */
export function getImageCacheSize() {
  return cache.size;
}

export function clearImageCache() {
  cache.clear();
}
