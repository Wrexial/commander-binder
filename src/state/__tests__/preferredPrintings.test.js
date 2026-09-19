import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MAX_PREFERRED_PRINTINGS } from '../../state/cardSettings.js';

function printing(id, name, released_at) {
  return { id, name, released_at };
}

describe('preferredPrintings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Fresh card store + module per test so settings start empty. */
  async function setup() {
    const { cardStore } = await import('../cardStore.js');
    const preferredPrintings = await import('../preferredPrintings.js');
    return { cardStore, preferredPrintings };
  }

  it('returns null until a printing is chosen', async () => {
    const { cardStore, preferredPrintings } = await setup();
    cardStore.add(printing('p2', 'Card', '2021-01-01'));

    expect(preferredPrintings.getPreferredPrinting('Card')).toBeNull();
    expect(preferredPrintings.getPreferredPrintings()).toEqual({});
  });

  it('remembers and resolves the chosen printing', async () => {
    const { cardStore, preferredPrintings } = await setup();
    const first = printing('p1', 'Card', '2010-01-01');
    const second = printing('p2', 'Card', '2021-01-01');
    cardStore.add(first);
    cardStore.add(second);

    expect(preferredPrintings.rememberPreferredPrinting(second)).toBe(true);
    expect(preferredPrintings.getPreferredPrinting('Card')).toBe(second);
    expect(preferredPrintings.resolveDisplayPrinting(first)).toBe(second);
  });

  it('keeps only one printing per card name', async () => {
    const { cardStore, preferredPrintings } = await setup();
    const first = printing('p1', 'Card', '2010-01-01');
    const second = printing('p2', 'Card', '2021-01-01');
    cardStore.add(first);
    cardStore.add(second);

    preferredPrintings.rememberPreferredPrinting(first);
    preferredPrintings.rememberPreferredPrinting(second);

    expect(Object.keys(preferredPrintings.getPreferredPrintings())).toEqual(['Card']);
    expect(preferredPrintings.getPreferredPrinting('Card')).toBe(second);
    expect(preferredPrintings.resolveDisplayPrinting(first)).toBe(second);
  });

  it('moves a re-picked name to the most-recent position', async () => {
    const { preferredPrintings } = await setup();

    preferredPrintings.rememberPreferredPrinting({ id: 'a-id', name: 'A' });
    preferredPrintings.rememberPreferredPrinting({ id: 'b-id', name: 'B' });
    preferredPrintings.rememberPreferredPrinting({ id: 'a2-id', name: 'A' });

    expect(Object.keys(preferredPrintings.getPreferredPrintings())).toEqual(['B', 'A']);
  });

  it('drops the oldest choices once the cap is reached', async () => {
    const { preferredPrintings } = await setup();

    for (let i = 0; i < MAX_PREFERRED_PRINTINGS + 5; i++) {
      preferredPrintings.rememberPreferredPrinting({ id: `id${i}`, name: `Card ${i}` });
    }

    const keys = Object.keys(preferredPrintings.getPreferredPrintings());
    expect(keys).toHaveLength(MAX_PREFERRED_PRINTINGS);
    expect(keys[0]).toBe('Card 5');
    expect(keys[keys.length - 1]).toBe(`Card ${MAX_PREFERRED_PRINTINGS + 4}`);
  });

  it('ignores a card without an id', async () => {
    const { preferredPrintings } = await setup();

    expect(preferredPrintings.rememberPreferredPrinting(null)).toBe(false);
    expect(preferredPrintings.getPreferredPrintings()).toEqual({});
  });

  it('falls back to the card when its chosen printing is not loaded', async () => {
    const { cardStore, preferredPrintings } = await setup();
    const first = printing('p1', 'Card', '2010-01-01');
    cardStore.add(first);

    preferredPrintings.rememberPreferredPrinting({ id: 'not-loaded', name: 'Card' });

    expect(preferredPrintings.resolveDisplayPrinting(first)).toBe(first);
  });

  it('keeps the in-memory choice when storage fails', async () => {
    const { preferredPrintings } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() =>
      preferredPrintings.rememberPreferredPrinting({ id: 'a', name: 'Card' })
    ).not.toThrow();
    expect(preferredPrintings.getPreferredPrintings()).toEqual({ Card: 'a' });
  });
});
