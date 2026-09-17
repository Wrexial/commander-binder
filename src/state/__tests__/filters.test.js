import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../cardState.js', () => ({ isCardOwned: vi.fn(() => false) }));
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
import { getDisplayedPrice } from '../../utils/prices.js';

function makeCard(overrides = {}) {
  return { name: 'Test', color_identity: [], rarity: 'rare', set: 'dom', ...overrides };
}

beforeEach(() => {
  resetFilters();
  isCardOwned.mockReturnValue(false);
  getDisplayedPrice.mockReturnValue(null);
});

describe('cardMatchesFilters', () => {
  it('passes everything by default', () => {
    expect(cardMatchesFilters(makeCard())).toBe(true);
  });

  it('filters by owned / missing', () => {
    isCardOwned.mockReturnValue(true);

    applyFilters({ ...DEFAULT_FILTERS, owned: 'owned' });
    expect(cardMatchesFilters(makeCard())).toBe(true);

    applyFilters({ ...DEFAULT_FILTERS, owned: 'missing' });
    expect(cardMatchesFilters(makeCard())).toBe(false);
  });

  it('matches any selected colour by default', () => {
    applyFilters({ ...DEFAULT_FILTERS, colors: ['W', 'U'] });

    expect(cardMatchesFilters(makeCard({ color_identity: ['W'] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['U', 'R'] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['B'] }))).toBe(false);
  });

  it('requires every selected colour in "all" mode', () => {
    applyFilters({ ...DEFAULT_FILTERS, colors: ['W', 'U'], colorMode: 'all' });

    expect(cardMatchesFilters(makeCard({ color_identity: ['W', 'U'] }))).toBe(true);
    expect(cardMatchesFilters(makeCard({ color_identity: ['W'] }))).toBe(false);
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

    applyFilters({ ...DEFAULT_FILTERS, owned: 'owned', colors: ['W'], priceMin: 1 });
    expect(activeFilterCount()).toBe(3);
  });
});

describe('normalizeFilters', () => {
  it('drops unknown values and coerces prices', () => {
    const result = normalizeFilters({
      owned: 'bogus',
      colors: ['W', 'X'],
      colorMode: 'weird',
      rarities: ['rare', 'nope'],
      set: 'DOM',
      priceMin: '1.5',
      priceMax: -3,
    });

    expect(result.owned).toBe('all');
    expect(result.colors).toEqual(['W']);
    expect(result.colorMode).toBe('any');
    expect(result.rarities).toEqual(['rare']);
    expect(result.set).toBe('dom');
    expect(result.priceMin).toBe(1.5);
    expect(result.priceMax).toBeNull();
  });

  it('returns defaults for junk input', () => {
    expect(normalizeFilters(null)).toEqual(DEFAULT_FILTERS);
  });
});
