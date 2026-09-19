import { describe, it, expect } from 'vitest';
import { nextPrinting, orderPrintingsByPrice, cheapestPrinting } from '../printings.js';

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
