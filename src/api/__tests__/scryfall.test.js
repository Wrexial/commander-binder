import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchPage,
  setBulkCardSource,
  clearBulkCardSource,
  isUsingBulkSource,
  setRequestThrottle,
  BULK_SOURCE_SENTINEL,
} from '../scryfall.js';
import { clearCache } from '../responseCache.js';
import { CARDS_PER_PAGE } from '../../config/constants.js';

const PAGE_URL = 'https://example.com/cards/search?page=1';

function makeCards(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `c${i}` }));
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  };
}

beforeEach(async () => {
  await clearCache();
  clearBulkCardSource();
  setRequestThrottle({ spacingMs: 0, maxRequests: 0 });
  global.fetch = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
});

describe('fetchPage', () => {
  it('fetches from the API when no bulk source is installed', async () => {
    expect(isUsingBulkSource()).toBe(false);

    await fetchPage(PAGE_URL);

    expect(global.fetch).toHaveBeenCalledWith(PAGE_URL);
  });

  it('chunks an installed bulk source and marks more pages with the sentinel', async () => {
    expect(setBulkCardSource(makeCards(CARDS_PER_PAGE + 3))).toBe(true);
    expect(isUsingBulkSource()).toBe(true);

    const first = await fetchPage('ignored');
    expect(first.data).toHaveLength(CARDS_PER_PAGE);
    expect(first.has_more).toBe(true);
    expect(first.next_page).toBe(BULK_SOURCE_SENTINEL);

    const second = await fetchPage('ignored');
    expect(second.data).toHaveLength(3);
    expect(second.has_more).toBe(false);
    expect(second.next_page).toBeNull();

    // A bulk source never touches the network.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to the API once the bulk source is cleared', async () => {
    setBulkCardSource(makeCards(2));
    clearBulkCardSource();
    expect(isUsingBulkSource()).toBe(false);

    await fetchPage(PAGE_URL);

    expect(global.fetch).toHaveBeenCalledWith(PAGE_URL);
  });
});

describe('setBulkCardSource', () => {
  it('rejects empty or non-array input', () => {
    expect(setBulkCardSource([])).toBe(false);
    expect(setBulkCardSource(null)).toBe(false);
    expect(isUsingBulkSource()).toBe(false);
  });
});
