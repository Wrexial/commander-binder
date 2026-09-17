import { describe, it, expect, beforeEach } from 'vitest';
import { getSavedSearch, saveSearch, getSavedScroll, saveScroll } from '../viewState.js';

describe('viewState', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('defaults to an empty search and zero scroll', () => {
    expect(getSavedSearch()).toBe('');
    expect(getSavedScroll()).toBe(0);
  });

  it('round-trips the search query', () => {
    saveSearch('c:w t:creature');
    expect(getSavedSearch()).toBe('c:w t:creature');
  });

  it('round-trips the scroll offset, rounding sub-pixel values', () => {
    saveScroll(1234.6);
    expect(getSavedScroll()).toBe(1235);
  });

  it('clamps negative and non-finite offsets to zero', () => {
    saveScroll(-50);
    expect(getSavedScroll()).toBe(0);
    saveScroll(NaN);
    expect(getSavedScroll()).toBe(0);
  });

  it('keeps search and scroll independent', () => {
    saveSearch('foo');
    saveScroll(300);
    expect(getSavedSearch()).toBe('foo');
    expect(getSavedScroll()).toBe(300);
  });

  it('falls back to defaults when the stored JSON is malformed', () => {
    sessionStorage.setItem('viewState', '{not json');
    expect(getSavedSearch()).toBe('');
    expect(getSavedScroll()).toBe(0);
  });
});
