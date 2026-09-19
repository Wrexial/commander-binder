import { vi, describe, it, expect, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({ cards: [] }));

vi.mock('../scryfall.js', () => ({
  MAX_COLLECTION_IDENTIFIERS: 75,
  fetchPage: vi.fn(),
  fetchCardsByIds: vi.fn(),
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
  resetCardSearchCache,
} from '../cardSearch.js';
import { fetchCardsByIds, fetchPage } from '../scryfall.js';
import { cardStore } from '../../state/cardStore.js';

beforeEach(() => {
  vi.clearAllMocks();
  store.cards = [];
  resetCardSearchCache();
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
});
