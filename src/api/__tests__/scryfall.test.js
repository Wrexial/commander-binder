import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchPage,
  fetchCardsByIds,
  setBulkCardSource,
  clearBulkCardSource,
  isUsingBulkSource,
  setRequestThrottle,
  BULK_SOURCE_SENTINEL,
} from '../scryfall.js';
import { clearCache } from '../responseCache.js';
import { getCardsPerPage } from '../../state/cardSettings.js';

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
    const perPage = getCardsPerPage();
    expect(setBulkCardSource(makeCards(perPage + 3))).toBe(true);
    expect(isUsingBulkSource()).toBe(true);

    const first = await fetchPage('ignored');
    expect(first.data).toHaveLength(perPage);
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

describe('fetchCardsByIds', () => {
  it('fetches cards by id in one collection request', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ data: [{ id: 'a' }] }));

    const cards = await fetchCardsByIds(['a', 'b']);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.scryfall.com/cards/collection');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ identifiers: [{ id: 'a' }, { id: 'b' }] });
    expect(cards).toEqual([{ id: 'a' }]);
  });

  it('is a no-op for an empty id list', async () => {
    expect(await fetchCardsByIds([])).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
