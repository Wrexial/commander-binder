import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../state/cardStore.js', () => ({
  cardStore: { getPrintings: vi.fn(() => []) },
}));

import { getDisplayedPrice, getCheapestPrice } from '../prices.js';
import { cardStore } from '../../state/cardStore.js';

beforeEach(() => {
  cardStore.getPrintings.mockReturnValue([]);
});

describe('getDisplayedPrice', () => {
  it('returns the cheapest of the non-foil and foil EUR prices', () => {
    expect(getDisplayedPrice({ prices: { eur: '12.50', eur_foil: '30.00' } })).toBe(12.5);
  });

  it('falls back to the foil price', () => {
    expect(getDisplayedPrice({ prices: { eur: null, eur_foil: '7.25' } })).toBe(7.25);
  });

  it('returns null when the printing has no price', () => {
    expect(getDisplayedPrice({ prices: {} })).toBeNull();
    expect(getDisplayedPrice({})).toBeNull();
  });
});

describe('getCheapestPrice', () => {
  it('returns the cheapest price across every printing', () => {
    cardStore.getPrintings.mockReturnValue([
      { prices: { eur: '10.00', eur_foil: '20.00' } },
      { prices: { eur: '5.00', eur_foil: null } },
    ]);

    expect(getCheapestPrice({ name: 'Cheap' })).toBe(5);
  });

  it('returns null when no printing is priced', () => {
    cardStore.getPrintings.mockReturnValue([{ prices: {} }]);
    expect(getCheapestPrice({ name: 'Unpriced' })).toBeNull();
  });
});
