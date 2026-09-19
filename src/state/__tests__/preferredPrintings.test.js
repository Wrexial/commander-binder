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
    expect(preferredPrintings.getPreferredPrintingIds()).toEqual([]);
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

  it('moves a re-picked printing to the most-recent position', async () => {
    const { preferredPrintings } = await setup();

    preferredPrintings.rememberPreferredPrinting({ id: 'a' });
    preferredPrintings.rememberPreferredPrinting({ id: 'b' });
    preferredPrintings.rememberPreferredPrinting({ id: 'a' });

    expect(preferredPrintings.getPreferredPrintingIds()).toEqual(['b', 'a']);
  });

  it('drops the oldest choices once the cap is reached', async () => {
    const { preferredPrintings } = await setup();

    for (let i = 0; i < MAX_PREFERRED_PRINTINGS + 5; i++) {
      preferredPrintings.rememberPreferredPrinting({ id: `p${i}` });
    }

    const ids = preferredPrintings.getPreferredPrintingIds();
    expect(ids).toHaveLength(MAX_PREFERRED_PRINTINGS);
    expect(ids[0]).toBe('p5');
    expect(ids[ids.length - 1]).toBe(`p${MAX_PREFERRED_PRINTINGS + 4}`);
  });

  it('ignores a card without an id', async () => {
    const { preferredPrintings } = await setup();

    expect(preferredPrintings.rememberPreferredPrinting(null)).toBe(false);
    expect(preferredPrintings.getPreferredPrintingIds()).toEqual([]);
  });

  it('falls back to the card when its chosen printing is not loaded', async () => {
    const { cardStore, preferredPrintings } = await setup();
    const first = printing('p1', 'Card', '2010-01-01');
    cardStore.add(first);

    preferredPrintings.rememberPreferredPrinting({ id: 'not-loaded' });

    expect(preferredPrintings.resolveDisplayPrinting(first)).toBe(first);
  });

  it('keeps the in-memory choice when storage fails', async () => {
    const { preferredPrintings } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => preferredPrintings.rememberPreferredPrinting({ id: 'a' })).not.toThrow();
    expect(preferredPrintings.getPreferredPrintingIds()).toEqual(['a']);
  });
});
