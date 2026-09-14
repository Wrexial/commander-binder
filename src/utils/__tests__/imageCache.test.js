import { describe, it, expect, beforeEach } from 'vitest';
import { getImage, clearImageCache, getImageCacheSize, IMAGE_CACHE_LIMIT } from '../imageCache.js';

describe('imageCache', () => {
  beforeEach(() => {
    clearImageCache();
  });

  it('returns the same element for the same url (no repeat request)', () => {
    const first = getImage('https://example.com/a.jpg');
    const second = getImage('https://example.com/a.jpg');

    expect(first).toBe(second);
    expect(getImageCacheSize()).toBe(1);
  });

  it('keeps separate elements for different urls', () => {
    const a = getImage('https://example.com/a.jpg');
    const b = getImage('https://example.com/b.jpg');

    expect(a).not.toBe(b);
    expect(getImageCacheSize()).toBe(2);
  });

  it('returns null for a missing url', () => {
    expect(getImage('')).toBeNull();
    expect(getImage(undefined)).toBeNull();
  });

  it('evicts the least-recently-used entry past the limit', () => {
    const first = getImage('https://example.com/first.jpg');
    for (let i = 0; i < IMAGE_CACHE_LIMIT; i++) {
      getImage(`https://example.com/${i}.jpg`);
    }

    expect(getImageCacheSize()).toBeLessThanOrEqual(IMAGE_CACHE_LIMIT);
    // `first` was the oldest and has been evicted, so a new element is created.
    expect(getImage('https://example.com/first.jpg')).not.toBe(first);
  });
});
