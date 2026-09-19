import { describe, it, expect, vi } from 'vitest';

vi.mock('../../state/cardState.js', () => ({ isCardOwned: vi.fn(() => false) }));
vi.mock('../../state/wishlistState.js', () => ({ isCardWanted: vi.fn(() => false) }));
vi.mock('../prices.js', () => ({
  getDisplayedPrice: vi.fn(() => null),
  formatPrice: (value) => (value == null ? '—' : `€${Number(value).toFixed(2)}`),
}));

import { DEFAULT_SORT, isDefaultSort, sortCards, sortMark } from '../sortCards.js';
import { isCardOwned } from '../../state/cardState.js';
import { isCardWanted } from '../../state/wishlistState.js';
import { getDisplayedPrice } from '../prices.js';

const cards = [
  { name: 'Beta', released_at: '1995-01-01', cmc: 3, rarity: 'rare' },
  { name: 'Alpha', released_at: '1993-01-01', cmc: 1, rarity: 'mythic' },
  { name: 'Gamma', released_at: '2000-01-01', cmc: 5, rarity: 'common' },
];

describe('isDefaultSort', () => {
  it('is only true for oldest first', () => {
    expect(isDefaultSort(DEFAULT_SORT)).toBe(true);
    expect(isDefaultSort('release-desc')).toBe(false);
    expect(isDefaultSort('name-asc')).toBe(false);
  });
});

describe('sortCards', () => {
  it('sorts by release date ascending by default', () => {
    expect(sortCards(cards, DEFAULT_SORT).map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('reverses for newest first', () => {
    expect(sortCards(cards, 'release-desc').map((c) => c.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts by name in both directions', () => {
    expect(sortCards(cards, 'name-asc').map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sortCards(cards, 'name-desc').map((c) => c.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('falls back to the default for an unknown id', () => {
    expect(sortCards(cards, 'bogus').map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts unpriced cards last when ascending', () => {
    getDisplayedPrice.mockImplementation((card) => ({ Alpha: 5, Beta: null, Gamma: 1 })[card.name]);

    expect(sortCards(cards, 'price-asc').map((c) => c.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('sorts by mana value', () => {
    expect(sortCards(cards, 'cmc-desc').map((c) => c.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts rarest first', () => {
    expect(sortCards(cards, 'rarity-asc').map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('groups by colour count: mono + colourless, then 2, 3, 4 and 5', () => {
    const colored = [
      { name: 'Five', color_identity: ['W', 'U', 'B', 'R', 'G'] },
      { name: 'Bant', color_identity: ['W', 'U', 'G'] },
      { name: 'Azorius', color_identity: ['W', 'U'] },
      { name: 'Dune', color_identity: ['W', 'B', 'R', 'G'] },
      { name: 'MonoU', color_identity: ['U'] },
      { name: 'MonoW', color_identity: ['W'] },
      { name: 'Colorless', color_identity: [] },
    ];

    expect(sortCards(colored, 'color-asc').map((c) => c.name)).toEqual([
      'MonoW',
      'MonoU',
      'Colorless',
      'Azorius',
      'Bant',
      'Dune',
      'Five',
    ]);
  });

  it('puts owned cards first (and missing first in reverse)', () => {
    isCardOwned.mockImplementation((card) => card.name === 'Gamma');

    expect(sortCards(cards, 'owned-asc').map((c) => c.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(sortCards(cards, 'owned-desc').map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('puts wanted cards first (and not wanted first in reverse)', () => {
    isCardWanted.mockImplementation((card) => card.name === 'Beta');

    expect(sortCards(cards, 'wanted-asc').map((c) => c.name)).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect(sortCards(cards, 'wanted-desc').map((c) => c.name)).toEqual(['Alpha', 'Gamma', 'Beta']);
  });
});

describe('sortMark', () => {
  it('uses the release year for release sorts', () => {
    expect(sortMark(cards[0], 'release-asc')).toBe('1995');
    expect(sortMark(cards[2], 'release-desc')).toBe('2000');
  });

  it('uses the first letter for name sorts', () => {
    expect(sortMark(cards[0], 'name-asc')).toBe('B');
  });

  it('uses the price, mana value and rarity for their sorts', () => {
    getDisplayedPrice.mockReturnValue(3.5);

    expect(sortMark(cards[0], 'price-asc')).toBe('€3.50');
    expect(sortMark(cards[1], 'cmc-asc')).toBe('1');
    expect(sortMark(cards[1], 'rarity-asc')).toBe('Mythic');
  });

  it('uses the owned state for the owned sorts', () => {
    isCardOwned.mockReturnValue(true);
    expect(sortMark(cards[0], 'owned-asc')).toBe('Owned');
  });

  it('uses the wishlist state for the wanted sorts', () => {
    isCardWanted.mockReturnValue(true);
    expect(sortMark(cards[0], 'wanted-asc')).toBe('Wanted');
  });

  it('names colour combinations for the mark', () => {
    expect(sortMark({ color_identity: ['W'] }, 'color-asc')).toBe('White');
    expect(sortMark({ color_identity: ['U', 'W'] }, 'color-asc')).toBe('Azorius');
    expect(sortMark({ color_identity: ['W', 'U', 'G'] }, 'color-asc')).toBe('Bant');
    expect(sortMark({ color_identity: ['W', 'B', 'R', 'G'] }, 'color-asc')).toBe('Dune');
    expect(sortMark({ color_identity: ['W', 'U', 'B', 'R', 'G'] }, 'color-asc')).toBe('WUBRG');
    expect(sortMark({ color_identity: [] }, 'color-asc')).toBe('Colourless');
  });
});
