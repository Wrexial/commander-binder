import { describe, it, expect, beforeEach } from 'vitest';
import { getCardImages, getCardImageUrls, preloadCardImages } from '../cardImages.js';
import { clearImageCache, getImageCacheSize, getImage } from '../imageCache.js';

const singleFace = {
  id: 'c1',
  layout: 'normal',
  image_uris: { normal: 'https://img.example/1.jpg' },
};

const modalDfc = {
  id: 'c2',
  layout: 'modal_dfc',
  card_faces: [
    { image_uris: { normal: 'https://img.example/2a.jpg' } },
    { image_uris: { normal: 'https://img.example/2b.jpg' } },
  ],
};

describe('getCardImages', () => {
  it('returns the normal image for a single-faced card', () => {
    expect(getCardImages(singleFace)).toEqual([{ url: 'https://img.example/1.jpg', key: 'c1' }]);
  });

  it('returns both faces for a multi-face layout', () => {
    expect(getCardImages(modalDfc)).toEqual([
      { url: 'https://img.example/2a.jpg', key: 'c2-0' },
      { url: 'https://img.example/2b.jpg', key: 'c2-1' },
    ]);
  });

  it('falls back to card_faces[0] when a top-level image is absent', () => {
    const card = {
      id: 'c3',
      layout: 'normal',
      card_faces: [{ normal: 'https://img.example/3.jpg' }],
    };
    expect(getCardImages(card)[0].url).toBe('https://img.example/3.jpg');
  });

  it('returns an empty array when there is no image', () => {
    expect(getCardImages({ id: 'c4', layout: 'normal' })).toEqual([]);
    expect(getCardImages(null)).toEqual([]);
  });

  it('prefers the WebP grid variant that desktop tiles already load', () => {
    const card = {
      id: 'c5',
      layout: 'normal',
      image_uris: {
        thumb: 'https://img.example/5-thumb.webp',
        grid: 'https://img.example/5-grid.webp',
        normal: 'https://img.example/5-normal.jpg',
      },
    };
    expect(getCardImages(card)).toEqual([{ url: 'https://img.example/5-grid.webp', key: 'c5' }]);
  });
});

describe('getCardImageUrls', () => {
  it('returns the thumb and grid for a single-faced card', () => {
    const card = {
      image_uris: { thumb: 't.webp', grid: 'g.webp', normal: 'n.jpg' },
    };
    expect(getCardImageUrls(card)).toEqual({ thumb: 't.webp', grid: 'g.webp' });
  });

  it('falls back to the normal image when the small variants are missing', () => {
    expect(getCardImageUrls({ image_uris: { normal: 'n.jpg' } })).toEqual({
      thumb: 'n.jpg',
      grid: 'n.jpg',
    });
  });

  it('uses the front face for multi-face layouts', () => {
    const card = {
      card_faces: [
        { image_uris: { thumb: 'front.webp', grid: 'front-grid.webp' } },
        { image_uris: { thumb: 'back.webp', grid: 'back-grid.webp' } },
      ],
    };
    expect(getCardImageUrls(card)).toEqual({
      thumb: 'front.webp',
      grid: 'front-grid.webp',
    });
  });

  it('returns null when there is no usable image', () => {
    expect(getCardImageUrls({ image_uris: {} })).toBeNull();
    expect(getCardImageUrls(null)).toBeNull();
  });
});

describe('preloadCardImages', () => {
  beforeEach(() => {
    clearImageCache();
  });

  it('starts loading one image for a single-faced card', () => {
    preloadCardImages(singleFace);

    expect(getImageCacheSize()).toBe(1);
    expect(getImage('https://img.example/1.jpg')).toBeTruthy();
  });

  it('starts loading both faces for a multi-face card', () => {
    preloadCardImages(modalDfc);

    expect(getImageCacheSize()).toBe(2);
  });

  it('reuses the already-cached element on repeat preloads', () => {
    preloadCardImages(singleFace);
    const first = getImage('https://img.example/1.jpg');

    preloadCardImages(singleFace);

    expect(getImageCacheSize()).toBe(1);
    expect(getImage('https://img.example/1.jpg')).toBe(first);
  });
});
