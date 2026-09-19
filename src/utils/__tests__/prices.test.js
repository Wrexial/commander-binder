import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../state/cardStore.js', () => ({
  cardStore: { getPrintings: vi.fn(() => []) },
}));

import { getDisplayedPrice, getCheapestPrice, formatPrice, formatPriceRange } from '../prices.js';
import { cardStore } from '../../state/cardStore.js';
import { cardSettings } from '../../state/cardSettings.js';

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

describe('currency selection', () => {
  const priced = {
    prices: {
      eur: '10.00',
      eur_foil: '20.00',
      usd: '12.00',
      usd_foil: '9.00',
      tix: '3.00',
    },
  };

  it('reads the fields for the requested currency', () => {
    expect(getDisplayedPrice(priced, 'eur')).toBe(10);
    expect(getDisplayedPrice(priced, 'usd')).toBe(9);
    expect(getDisplayedPrice(priced, 'tix')).toBe(3);
  });

  it('defaults to the currency selected in settings', () => {
    const previous = cardSettings.currency;
    cardSettings.currency = 'usd';
    expect(getDisplayedPrice(priced)).toBe(9);
    cardSettings.currency = previous;
  });

  it('uses the configured currency for the cheapest printing too', () => {
    cardStore.getPrintings.mockReturnValue([
      { prices: { eur: '10.00', usd: '4.00' } },
      { prices: { eur: '5.00', usd: '8.00' } },
    ]);
    expect(getCheapestPrice({ name: 'Card' }, 'eur')).toBe(5);
    expect(getCheapestPrice({ name: 'Card' }, 'usd')).toBe(4);
  });
});

describe('formatPrice', () => {
  it('prefixes EUR and USD and suffixes TIX', () => {
    expect(formatPrice(1.5, { currency: 'eur' })).toBe('€1.50');
    expect(formatPrice(1.5, { currency: 'usd' })).toBe('$1.50');
    expect(formatPrice(1.5, { currency: 'tix' })).toBe('1.50 TIX');
  });

  it('honours the decimals option and missing values', () => {
    expect(formatPrice(5, { currency: 'eur', decimals: 0 })).toBe('€5');
    expect(formatPrice(null)).toBe('—');
  });

  it('formats threshold ranges per currency', () => {
    expect(formatPriceRange(1, 5, 'eur')).toBe('€1–5');
    expect(formatPriceRange(50, null, 'eur')).toBe('€50+');
    expect(formatPriceRange(1, 5, 'tix')).toBe('1–5 TIX');
    expect(formatPriceRange(50, null, 'tix')).toBe('50+ TIX');
  });
});
