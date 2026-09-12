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

  it('clear empties the store', () => {
    cardStore.add(card('a', 'Card', '2010-01-01'));
    cardStore.clear();

    expect(cardStore.getPrintings('Card')).toHaveLength(0);
    expect(cardStore.getAll()).toHaveLength(0);
  });
});
