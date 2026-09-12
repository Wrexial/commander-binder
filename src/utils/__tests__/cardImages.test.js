import { describe, it, expect, beforeEach } from 'vitest';
import { getCardImages, preloadCardImages } from '../cardImages.js';
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
    expect(getCardImages(singleFace)).toEqual([
      { url: 'https://img.example/1.jpg', key: 'c1' },
    ]);
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
