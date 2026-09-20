import { describe, it, expect } from 'vitest';
import {
  nextPrinting,
  orderPrintingsByPrice,
  cheapestPrinting,
  oldestPrinting,
  mostExpensivePrinting,
  fullArtPrinting,
  selectPrinting,
} from '../printings.js';

const a = { id: 'a' };
const b = { id: 'b' };
const c = { id: 'c' };

describe('nextPrinting', () => {
  it('returns the next printing in release order', () => {
    expect(nextPrinting([a, b, c], a)).toBe(b);
    expect(nextPrinting([a, b, c], b)).toBe(c);
  });

  it('wraps around from the last printing', () => {
    expect(nextPrinting([a, b, c], c)).toBe(a);
  });

  it('steps backwards when the direction is negative', () => {
    expect(nextPrinting([a, b, c], b, -1)).toBe(a);
    expect(nextPrinting([a, b, c], c, -1)).toBe(b);
    // Wraps from the first back to the last.
    expect(nextPrinting([a, b, c], a, -1)).toBe(c);
  });

  it('returns null for a single printing or a missing card', () => {
    expect(nextPrinting([a], a)).toBeNull();
    expect(nextPrinting([a, b], null)).toBeNull();
    expect(nextPrinting(null, a)).toBeNull();
  });

  it('falls back to the first printing when the card is unknown', () => {
    expect(nextPrinting([a, b], { id: 'z' })).toBe(a);
  });
});

describe('orderPrintingsByPrice', () => {
  const cheap = { id: 'cheap', released_at: '1995-01-01', prices: { eur: '2.00' } };
  const mid = { id: 'mid', released_at: '2010-01-01', prices: { eur: '10.00' } };
  const pricey = { id: 'pricey', released_at: '2020-01-01', prices: { eur: '30.00' } };
  const unpriced = { id: 'unpriced', released_at: '2005-01-01', prices: {} };

  it('orders cheapest first and unpriced printings last', () => {
    const ordered = orderPrintingsByPrice([pricey, unpriced, cheap, mid]);
    expect(ordered.map((p) => p.id)).toEqual(['cheap', 'mid', 'pricey', 'unpriced']);
  });

  it('breaks price ties by release date, oldest first', () => {
    const first = { id: 'first', released_at: '1999-01-01', prices: { eur: '5.00' } };
    const second = { id: 'second', released_at: '2010-01-01', prices: { eur: '5.00' } };
    expect(orderPrintingsByPrice([second, first]).map((p) => p.id)).toEqual(['first', 'second']);
  });

  it('keeps release order when nothing is priced', () => {
    const old = { id: 'old', released_at: '2000-01-01' };
    const newer = { id: 'newer', released_at: '2010-01-01' };
    expect(orderPrintingsByPrice([newer, old]).map((p) => p.id)).toEqual(['old', 'newer']);
  });

  it('does not mutate the input list', () => {
    const input = [pricey, cheap];
    orderPrintingsByPrice(input);
    expect(input.map((p) => p.id)).toEqual(['pricey', 'cheap']);
  });
});

describe('cheapestPrinting', () => {
  it('returns the cheapest printing', () => {
    const cheap = { id: 'cheap', prices: { eur: '2.00' } };
    const pricey = { id: 'pricey', prices: { eur: '30.00' } };
    expect(cheapestPrinting([pricey, cheap])).toBe(cheap);
  });

  it('returns null for an empty list', () => {
    expect(cheapestPrinting([])).toBeNull();
  });
});

describe('oldestPrinting', () => {
  it('returns the earliest-released printing', () => {
    const old = { id: 'old', released_at: '1993-08-05' };
    const newer = { id: 'newer', released_at: '2020-01-01' };
    expect(oldestPrinting([newer, old])).toBe(old);
  });

  it('returns null for an empty or missing list', () => {
    expect(oldestPrinting([])).toBeNull();
    expect(oldestPrinting(null)).toBeNull();
  });
});

describe('mostExpensivePrinting', () => {
  it('returns the priciest priced printing', () => {
    const cheap = { id: 'cheap', prices: { eur: '2.00' } };
    const pricey = { id: 'pricey', prices: { eur: '30.00' } };
    expect(mostExpensivePrinting([cheap, pricey])).toBe(pricey);
  });

  it('ignores unpriced printings and returns null when none are priced', () => {
    expect(mostExpensivePrinting([{ id: 'x', prices: {} }])).toBeNull();
  });
});

describe('fullArtPrinting', () => {
  it('returns the cheapest full-art printing', () => {
    const plain = { id: 'plain', full_art: false, prices: { eur: '1.00' } };
    const fullCheap = { id: 'full-cheap', full_art: true, prices: { eur: '3.00' } };
    const fullPricey = { id: 'full-pricey', full_art: true, prices: { eur: '8.00' } };
    expect(fullArtPrinting([plain, fullPricey, fullCheap])).toBe(fullCheap);
  });

  it('returns null when the card has no full-art printing', () => {
    expect(fullArtPrinting([{ id: 'plain', full_art: false }])).toBeNull();
  });
});

describe('selectPrinting', () => {
  const old = { id: 'old', released_at: '1993-08-05', full_art: false, prices: { eur: '10.00' } };
  const cheapNew = {
    id: 'cheap-new',
    released_at: '2020-01-01',
    full_art: true,
    prices: { eur: '2.00' },
  };
  const priceyNew = {
    id: 'pricey-new',
    released_at: '2021-01-01',
    full_art: false,
    prices: { eur: '40.00' },
  };
  const list = [old, cheapNew, priceyNew];

  it('defaults to the oldest printing', () => {
    expect(selectPrinting(list, 'oldest')).toBe(old);
    expect(selectPrinting(list, undefined)).toBe(old);
  });

  it('selects by mode', () => {
    expect(selectPrinting(list, 'cheapest')).toBe(cheapNew);
    expect(selectPrinting(list, 'most-expensive')).toBe(priceyNew);
    expect(selectPrinting(list, 'full-art')).toBe(cheapNew);
  });

  it('falls back to the oldest printing when a mode has no match', () => {
    const unpricedPlain = [
      { id: 'a', released_at: '1993-08-05', full_art: false, prices: {} },
      { id: 'b', released_at: '2020-01-01', full_art: false, prices: {} },
    ];
    expect(selectPrinting(unpricedPlain, 'most-expensive')).toBe(unpricedPlain[0]);
    expect(selectPrinting(unpricedPlain, 'full-art')).toBe(unpricedPlain[0]);
  });
});
