import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../cardState.js', () => ({ isCardOwned: vi.fn(() => false) }));
vi.mock('../wishlistState.js', () => ({ isCardWanted: vi.fn(() => false) }));
vi.mock('../../utils/prices.js', () => ({ getDisplayedPrice: vi.fn(() => null) }));

import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
  cardMatchesFilters,
  normalizeFilters,
  resetFilters,
} from '../filters.js';
import { isCardOwned } from '../cardState.js';
import { isCardWanted } from '../wishlistState.js';
import { getDisplayedPrice } from '../../utils/prices.js';

function makeCard(overrides = {}) {
  return { name: 'Test', color_identity: [], rarity: 'rare', set: 'dom', ...overrides };
}

beforeEach(() => {
  resetFilters();
  isCardOwned.mockReturnValue(false);
  isCardWanted.mockReturnValue(false);
  getDisplayedPrice.mockReturnValue(null);
});

describe('cardMatchesFilters', () => {
  it('passes everything by default', () => {
    expect(cardMatchesFilters(makeCard())).toBe(true);
  });

  it('filters by the collection lens', () => {
    isCardOwned.mockReturnValue(true);
    isCardWanted.mockReturnValue(true);

    applyFilters({ ...DEFAULT_FILTERS, collection: 'owned' });
    expect(cardMatchesFilters(makeCard())).toBe(true);

    applyFilters({ ...DEFAULT_FILTERS, collection: 'missing' });
    expect(cardMatchesFilters(makeCard())).toBe(false);

    applyFilters({ ...DEFAULT_FILTERS, collection: 'wanted' });
    expect(cardMatchesFilters(makeCard())).toBe(true);

    isCardWanted.mockReturnValue(false);
    applyFilters({ ...DEFAULT_FILTERS, collection: 'wanted' });
    expect(cardMatchesFilters(makeCard())).toBe(false);

    isCardOwned.mockReturnValue(false);
    applyFilters({ ...DEFAULT_FILTERS, collection: 'missing' });
    expect(cardMatchesFilters(makeCard())).toBe(true);
  });

  it('defaults to exclusive colour matching', () => {
    applyFilters({ ...DEFAULT_FILTERS, colors: ['W', 'U'] });

    expect(cardMatchesFilters(makeCard({ color_identity: ['W'] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['U'] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['W', 'U'] }))).toBe(true);
    // A colour outside the selection is excluded.
    expect(cardMatchesFilters(makeCard({ color_identity: ['U', 'R'] }))).toBe(false);
    expect(cardMatchesFilters(makeCard({ color_identity: ['B'] }))).toBe(false);
  });

  it('matches exactly the selected colours in "exact" mode', () => {
    applyFilters({ ...DEFAULT_FILTERS, colors: ['W', 'U'], colorMode: 'exact' });

    expect(cardMatchesFilters(makeCard({ color_identity: ['U', 'W'] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['W'] }))).toBe(false);
    expect(cardMatchesFilters(makeCard({ color_identity: ['W', 'U', 'G'] }))).toBe(false);
    expect(cardMatchesFilters(makeCard({ color_identity: [] }))).toBe(false);
  });

  it('matches only the selected colours in "exclusive" mode', () => {
    applyFilters({ ...DEFAULT_FILTERS, colors: ['W', 'B'], colorMode: 'exclusive' });

    // W, B and WB are all subsets of {W, B}.
    expect(cardMatchesFilters(makeCard({ color_identity: ['W'] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['B'] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['W', 'B'] }))).toBe(true);
    // Anything using another colour is excluded.
    expect(cardMatchesFilters(makeCard({ color_identity: ['W', 'U'] }))).toBe(false);
    expect(cardMatchesFilters(makeCard({ color_identity: ['W', 'U', 'B'] }))).toBe(false);
    // Colourless is opt-in via its own pip, like every other mode.
    expect(cardMatchesFilters(makeCard({ color_identity: [] }))).toBe(false);
  });

  it('includes colourless in "exclusive" mode only when its pip is selected', () => {
    applyFilters({ ...DEFAULT_FILTERS, colors: ['W', 'C'], colorMode: 'exclusive' });

    expect(cardMatchesFilters(makeCard({ color_identity: [] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['W'] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['W', 'U'] }))).toBe(false);
  });

  it('treats the colourless pip as an empty identity', () => {
    applyFilters({ ...DEFAULT_FILTERS, colors: ['C'] });

    expect(cardMatchesFilters(makeCard({ color_identity: [] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['G'] }))).toBe(false);
  });

  it('filters by rarity and set', () => {
    applyFilters({ ...DEFAULT_FILTERS, rarities: ['mythic'], set: 'dom' });

    expect(cardMatchesFilters(makeCard({ rarity: 'mythic', set: 'dom' }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ rarity: 'rare', set: 'dom' }))).toBe(false);
    expect(cardMatchesFilters(makeCard({ rarity: 'mythic', set: 'ice' }))).toBe(false);
  });

  it('filters by price and excludes unpriced cards', () => {
    applyFilters({ ...DEFAULT_FILTERS, priceMin: 1, priceMax: 10 });

    getDisplayedPrice.mockReturnValue(5);
    expect(cardMatchesFilters(makeCard())).toBe(true);

    getDisplayedPrice.mockReturnValue(0.5);
    expect(cardMatchesFilters(makeCard())).toBe(false);

    getDisplayedPrice.mockReturnValue(20);
    expect(cardMatchesFilters(makeCard())).toBe(false);

    getDisplayedPrice.mockReturnValue(null);
    expect(cardMatchesFilters(makeCard())).toBe(false);
  });
});

describe('activeFilterCount', () => {
  it('counts each active group', () => {
    expect(activeFilterCount()).toBe(0);

    applyFilters({ ...DEFAULT_FILTERS, collection: 'owned', colors: ['W'], priceMin: 1 });
    expect(activeFilterCount()).toBe(3);

    applyFilters({ ...DEFAULT_FILTERS, collection: 'wanted' });
    expect(activeFilterCount()).toBe(1);
  });
});

describe('normalizeFilters', () => {
  it('drops unknown values and coerces prices', () => {
    const result = normalizeFilters({
      collection: 'bogus',
      colors: ['W', 'X'],
      colorMode: 'weird',
      rarities: ['rare', 'nope'],
      set: 'DOM',
      priceMin: '1.5',
      priceMax: -3,
    });

    expect(result.collection).toBe('all');
    expect(result.colors).toEqual(['W']);
    expect(result.colorMode).toBe('exclusive');
    expect(result.rarities).toEqual(['rare']);
    expect(result.set).toBe('dom');
    expect(result.priceMin).toBe(1.5);
    expect(result.priceMax).toBeNull();
  });

  it('returns defaults for junk input', () => {
    expect(normalizeFilters(null)).toEqual(DEFAULT_FILTERS);
  });

  it('keeps empty price bounds empty instead of coercing them to zero', () => {
    expect(normalizeFilters({ priceMin: null, priceMax: null })).toMatchObject({
      priceMin: null,
      priceMax: null,
    });
    expect(normalizeFilters({ priceMin: '', priceMax: undefined })).toMatchObject({
      priceMin: null,
      priceMax: null,
    });
  });

  it('accepts the exact colour mode', () => {
    expect(normalizeFilters({ colorMode: 'exact' }).colorMode).toBe('exact');
  });

  it('accepts the exclusive colour mode', () => {
    expect(normalizeFilters({ colorMode: 'exclusive' }).colorMode).toBe('exclusive');
  });

  it('migrates the old separate owned/wanted filters into the collection lens', () => {
    expect(normalizeFilters({ owned: 'owned' }).collection).toBe('owned');
    expect(normalizeFilters({ owned: 'missing' }).collection).toBe('missing');
    expect(normalizeFilters({ wanted: 'wanted' }).collection).toBe('wanted');
    // "Not wanted" no longer has a lens, so it falls back to All.
    expect(normalizeFilters({ wanted: 'unwanted' }).collection).toBe('all');
  });
});
