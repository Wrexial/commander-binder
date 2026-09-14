import { describe, it, expect } from 'vitest';
import { nextPrinting } from '../printings.js';

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

  it('returns null for a single printing or a missing card', () => {
    expect(nextPrinting([a], a)).toBeNull();
    expect(nextPrinting([a, b], null)).toBeNull();
    expect(nextPrinting(null, a)).toBeNull();
  });

  it('falls back to the first printing when the card is unknown', () => {
    expect(nextPrinting([a, b], { id: 'z' })).toBe(a);
  });
});
