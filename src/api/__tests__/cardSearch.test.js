import { vi, describe, it, expect, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({ cards: [] }));

vi.mock('../scryfall.js', () => ({
  MAX_COLLECTION_IDENTIFIERS: 75,
  fetchPage: vi.fn(),
  fetchCardsByIds: vi.fn(),
}));

vi.mock('../cardArchive.js', () => ({
  hasCardArchive: vi.fn(async () => false),
  readArchivedCards: vi.fn(async () => new Map()),
}));

vi.mock('../../state/cardCatalog.js', () => ({
  getCatalogPrintingIds: vi.fn(() => null),
}));

vi.mock('../../state/cardStore.js', () => ({
  cardStore: {
    add: vi.fn((card) => store.cards.push(card)),
    getPrintings: vi.fn((name) => store.cards.filter((card) => card.name === name)),
    getByPrintingId: vi.fn((id) => store.cards.find((card) => card.id === id) || null),
  },
}));

import {
  autocompleteCardNames,
  ensurePrintingsLoaded,
  hydrateCardsByIds,
  loadPrintingsForName,
  loadPrintingsForNames,
  resetCardSearchCache,
} from '../cardSearch.js';
import { fetchCardsByIds, fetchPage } from '../scryfall.js';
import { cardStore } from '../../state/cardStore.js';
import { hasCardArchive, readArchivedCards } from '../cardArchive.js';
import { getCatalogPrintingIds } from '../../state/cardCatalog.js';

beforeEach(() => {
  vi.clearAllMocks();
  store.cards = [];
  resetCardSearchCache();
  // Default back to the search-API path; archive tests opt in per case.
  hasCardArchive.mockResolvedValue(false);
  readArchivedCards.mockResolvedValue(new Map());
  getCatalogPrintingIds.mockReturnValue(null);
});

describe('autocompleteCardNames', () => {
  it('returns the Scryfall catalog and ignores short queries', async () => {
    fetchPage.mockResolvedValue({ data: ['Sol Ring', 'Solitude'] });

    expect(await autocompleteCardNames('sol')).toEqual(['Sol Ring', 'Solitude']);
    expect(fetchPage).toHaveBeenCalledWith(expect.stringContaining('/cards/autocomplete?q=sol'));

    expect(await autocompleteCardNames('s')).toEqual([]);
  });
});

describe('loadPrintingsForName', () => {
  it('follows search pages, adds every printing to the store', async () => {
    fetchPage
      .mockResolvedValueOnce({
        data: [{ id: 'a', name: 'Sol Ring' }],
        has_more: true,
        next_page: 'page-2',
      })
      .mockResolvedValueOnce({ data: [{ id: 'b', name: 'Sol Ring' }], has_more: false });

    const cards = await loadPrintingsForName('Sol Ring');

    expect(cards).toHaveLength(2);
    expect(cardStore.add).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`q=${encodeURIComponent('!"Sol Ring"')}`)
    );
  });
});

describe('ensurePrintingsLoaded', () => {
  it('does not refetch a card whose printing list is already present', async () => {
    store.cards = [
      { id: 'a', name: 'Sol Ring' },
      { id: 'b', name: 'Sol Ring' },
    ];

    await ensurePrintingsLoaded('Sol Ring');

    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('marks a single-printing card so it is only fetched once', async () => {
    fetchPage.mockResolvedValue({ data: [{ id: 'a', name: 'Solitude' }], has_more: false });

    await ensurePrintingsLoaded('Solitude');
    await ensurePrintingsLoaded('Solitude');

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe('loadPrintingsForNames', () => {
  it('fetches several names in one batched search', async () => {
    fetchPage.mockResolvedValue({
      data: [
        { id: 'a', name: 'Sol Ring' },
        { id: 'b', name: 'Arcane Signet' },
      ],
      has_more: false,
    });

    const added = await loadPrintingsForNames(['Sol Ring', 'Arcane Signet']);

    expect(added).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    const url = fetchPage.mock.calls[0][0];
    expect(url).toContain(encodeURIComponent('!"Sol Ring"'));
    expect(url).toContain(encodeURIComponent('!"Arcane Signet"'));
    expect(url).toContain('unique=prints');
    expect(cardStore.add).toHaveBeenCalledTimes(2);
  });

  it('skips names whose printings are already loaded', async () => {
    store.cards = [
      { id: 'a', name: 'Sol Ring' },
      { id: 'b', name: 'Sol Ring' },
    ];
    fetchPage.mockResolvedValue({ data: [], has_more: false });

    expect(await loadPrintingsForNames(['Sol Ring'])).toBe(false);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('chunks a long list into batches', async () => {
    const names = Array.from({ length: 25 }, (_, i) => `Card ${i}`);
    fetchPage.mockResolvedValue({ data: [], has_more: false });

    await loadPrintingsForNames(names);

    // 25 names / batch of 10 => 3 requests rather than 25.
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('does not retry an attempted batch on the next eager pass', async () => {
    fetchPage.mockRejectedValue(new Error('429 Too Many Requests'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await loadPrintingsForNames(['Sol Ring']);
    await loadPrintingsForNames(['Sol Ring']);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('splits a batch that would be truncated instead of dropping printings', async () => {
    const batchSizes = [];
    fetchPage.mockImplementation(async (url) => {
      const size = (decodeURIComponent(url).match(/!"/g) || []).length;
      batchSizes.push(size);
      if (size > 2) {
        // The full batch overflows the page cap (it keeps claiming more pages).
        return {
          data: [{ id: `full-${batchSizes.length}`, name: 'A' }],
          has_more: true,
          next_page: url,
        };
      }
      // Each split half fits in a single page.
      return { data: [{ id: `half-${batchSizes.length}`, name: 'A' }], has_more: false };
    });

    await loadPrintingsForNames(['A', 'B', 'C', 'D']);

    // It pages to the cap for the 4-name batch, then one page per 2-name half.
    expect(batchSizes.filter((size) => size === 4).length).toBeGreaterThan(1);
    expect(batchSizes.filter((size) => size === 2)).toHaveLength(2);
  });
});

describe('hydrateCardsByIds', () => {
  it('fetches only the missing ids and adds them', async () => {
    store.cards = [{ id: 'known', name: 'Known' }];
    fetchCardsByIds.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    const added = await hydrateCardsByIds(['known', 'a', 'b', 'a']);

    expect(fetchCardsByIds).toHaveBeenCalledWith(['a', 'b']);
    expect(added).toHaveLength(2);
  });

  it('chunks more than 75 ids', async () => {
    const ids = Array.from({ length: 80 }, (_, i) => `id${i}`);
    fetchCardsByIds.mockResolvedValue([]);

    await hydrateCardsByIds(ids);

    expect(fetchCardsByIds).toHaveBeenCalledTimes(2);
  });

  it('serves a repeat hydrate from the card cache without refetching', async () => {
    fetchCardsByIds.mockResolvedValue([{ id: 'a', name: 'A' }]);
    await hydrateCardsByIds(['a']);
    expect(fetchCardsByIds).toHaveBeenCalledTimes(1);

    // Simulate a reload: the in-memory store is empty again, but the card was
    // persisted by the first fetch.
    store.cards = [];
    await hydrateCardsByIds(['a']);

    expect(fetchCardsByIds).toHaveBeenCalledTimes(1);
    expect(cardStore.add).toHaveBeenCalledWith({ id: 'a', name: 'A' });
  });

  it('serves ids from the local archive without any network request', async () => {
    readArchivedCards.mockResolvedValue(
      new Map([['arch-1', { id: 'arch-1', name: 'From archive' }]])
    );

    const added = await hydrateCardsByIds(['arch-1', 'arch-1']);

    expect(fetchCardsByIds).not.toHaveBeenCalled();
    expect(added).toEqual([{ id: 'arch-1', name: 'From archive' }]);
  });
});

describe('loadPrintingsForNames with the card archive', () => {
  it('resolves a name from the catalog/archive instead of searching', async () => {
    hasCardArchive.mockResolvedValue(true);
    getCatalogPrintingIds.mockImplementation((name) => (name === 'Sol Ring' ? ['p1', 'p2'] : null));
    readArchivedCards.mockResolvedValue(
      new Map([
        ['p1', { id: 'p1', name: 'Sol Ring' }],
        ['p2', { id: 'p2', name: 'Sol Ring' }],
      ])
    );

    const added = await loadPrintingsForNames(['Sol Ring']);

    expect(added).toBe(true);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(getCatalogPrintingIds).toHaveBeenCalledWith('Sol Ring');
  });

  it('falls back to a search when the catalog has no ids for the name', async () => {
    hasCardArchive.mockResolvedValue(true);
    getCatalogPrintingIds.mockReturnValue(null);
    fetchPage.mockResolvedValue({ data: [{ id: 's1', name: 'Unknown' }], has_more: false });

    await loadPrintingsForNames(['Unknown']);

    expect(fetchPage).toHaveBeenCalled();
  });
});
