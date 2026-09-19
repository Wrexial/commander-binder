import { describe, it, expect, beforeEach } from 'vitest';
import { cardStore } from '../cardStore.js';

function card(id, name, released_at) {
  return { id, name, released_at };
}

describe('cardStore', () => {
  beforeEach(() => {
    cardStore.clear();
  });

  it('keeps printings sorted by release date as they are added out of order', () => {
    cardStore.add(card('c', 'Card', '2020-01-01'));
    cardStore.add(card('a', 'Card', '2010-01-01'));
    cardStore.add(card('b', 'Card', '2015-01-01'));

    expect(cardStore.getPrintings('Card').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('dedupes printings by id', () => {
    cardStore.add(card('a', 'Card', '2010-01-01'));
    cardStore.add(card('a', 'Card', '2010-01-01'));

    expect(cardStore.getPrintings('Card')).toHaveLength(1);
  });

  it('groups double-faced cards by their front-face name', () => {
    cardStore.add(card('a', 'Front // Back', '2010-01-01'));

    expect(cardStore.getPrintings('Front')).toHaveLength(1);
    expect(cardStore.getPrintings('Front // Back')).toHaveLength(1);
  });

  it('getAll returns one (oldest) printing per name', () => {
    cardStore.add(card('new', 'Card', '2015-01-01'));
    cardStore.add(card('old', 'Card', '2010-01-01'));

    expect(cardStore.getAll().map((p) => p.id)).toEqual(['old']);
  });

  it('getOldestPrinting returns the earliest printing', () => {
    cardStore.add(card('b', 'Card', '2015-01-01'));
    cardStore.add(card('a', 'Card', '2010-01-01'));

    expect(cardStore.getOldestPrinting('Card').id).toBe('a');
    expect(cardStore.getOldestPrinting('Unknown')).toBeUndefined();
  });

  describe('getPrintingPosition', () => {
    it('returns the 1-based release-ordered position and total', () => {
      cardStore.add(card('a', 'Card', '2010-01-01'));
      cardStore.add(card('b', 'Card', '2015-01-01'));
      cardStore.add(card('c', 'Card', '2020-01-01'));

      expect(cardStore.getPrintingPosition(card('a', 'Card', '2010-01-01'))).toEqual({
        index: 1,
        total: 3,
      });
      expect(cardStore.getPrintingPosition(card('c', 'Card', '2020-01-01'))).toEqual({
        index: 3,
        total: 3,
      });
    });

    it('reports a single printing', () => {
      cardStore.add(card('a', 'Card', '2010-01-01'));

      expect(cardStore.getPrintingPosition(card('a', 'Card', '2010-01-01'))).toEqual({
        index: 1,
        total: 1,
      });
    });

    it('ranks by price so the cheapest printing is 1', () => {
      cardStore.add({
        id: 'pricey',
        name: 'Card',
        released_at: '1995-01-01',
        prices: { eur: '40.00' },
      });
      cardStore.add({
        id: 'mid',
        name: 'Card',
        released_at: '2010-01-01',
        prices: { eur: '10.00' },
      });
      cardStore.add({
        id: 'cheap',
        name: 'Card',
        released_at: '2020-01-01',
        prices: { eur: '2.00' },
      });

      expect(cardStore.getPrintingPosition(card('cheap', 'Card', '2020-01-01')).index).toBe(1);
      expect(cardStore.getPrintingPosition(card('mid', 'Card', '2010-01-01')).index).toBe(2);
      expect(cardStore.getPrintingPosition(card('pricey', 'Card', '1995-01-01')).index).toBe(3);
    });

    it('returns zeroes for a card with no name', () => {
      expect(cardStore.getPrintingPosition(null)).toEqual({ index: 0, total: 0 });
    });
  });

  it('clear empties the store', () => {
    cardStore.add(card('a', 'Card', '2010-01-01'));
    cardStore.clear();

    expect(cardStore.getPrintings('Card')).toHaveLength(0);
    expect(cardStore.getAll()).toHaveLength(0);
  });
});
