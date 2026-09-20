import { vi, describe, it, expect, beforeEach } from 'vitest';
import { cardStore } from '../cardStore.js';

/** In-memory stand-in for the IndexedDB-backed local binder store. */
const local = vi.hoisted(() => ({ records: [] }));

vi.mock('../localBinders.js', () => ({
  loadLocalBinders: vi.fn(async () => local.records),
  saveLocalBinder: vi.fn(async (binder) => {
    const index = local.records.findIndex((record) => record.id === binder.id);
    if (index >= 0) local.records[index] = binder;
    else local.records.push(binder);
    return true;
  }),
  removeLocalBinder: vi.fn(async (id) => {
    local.records = local.records.filter((record) => record.id !== id);
    return true;
  }),
  clearLocalBinders: vi.fn(async () => {
    local.records = [];
  }),
}));

vi.mock('../cardSettings.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSetting: vi.fn((key) => ({ gridColumns: 3, gridRows: 3, pagesPerBinder: 2 })[key]),
}));

async function load() {
  return import('../bindersState.js');
}

beforeEach(() => {
  local.records = [];
  localStorage.clear();
});

describe('bindersState', () => {
  it('seeds a default binder from the grid settings on first load', async () => {
    const { loadBinders, getBinders, getActiveBinder } = await load();
    await loadBinders();

    const [binder] = getBinders();
    expect(binder.name).toBe('Binder 1');
    expect(binder.columns).toBe(3);
    expect(binder.rows).toBe(3);
    expect(binder.pages).toBe(2);
    expect(binder.slots).toEqual({});
    expect(getActiveBinder().id).toBe(binder.id);
  });

  it('sanitizes stored records: clamps dimensions and drops bad slots', async () => {
    local.records = [
      {
        id: 'b1',
        name: 'Odd binder',
        columns: 999,
        rows: -4,
        pages: 0,
        slots: { '0:0:0': 'ok', 'not-a-slot': 'x', '0:0:1': 5, '0:0:2': '' },
      },
    ];

    const { loadBinders, getActiveBinder } = await load();
    await loadBinders();

    const binder = getActiveBinder();
    expect(binder.columns).toBe(16);
    expect(binder.rows).toBe(1);
    expect(binder.pages).toBe(1);
    expect(binder.slots).toEqual({ '0:0:0': 'ok' });
  });

  it('creates uniquely-named binders and makes the new one active', async () => {
    const { loadBinders, createBinder, getBinders, getActiveBinder } = await load();
    await loadBinders();

    const created = await createBinder({ columns: 4, rows: 4 });
    expect(created.name).toBe('Binder 2');
    expect(getBinders()).toHaveLength(2);
    expect(getActiveBinder().id).toBe(created.id);
  });

  it('clamps dimension updates', async () => {
    const { loadBinders, getActiveBinder, updateBinder } = await load();
    await loadBinders();
    const { id } = getActiveBinder();

    await updateBinder(id, { columns: 99, rows: 0, pages: 1000 });
    const binder = getActiveBinder();
    expect(binder.columns).toBe(16);
    expect(binder.rows).toBe(1);
    expect(binder.pages).toBe(200);

    await updateBinder(id, { name: '  Trade binder  ' });
    expect(getActiveBinder().name).toBe('Trade binder');
  });

  it('assigns, clears and persists slot cards', async () => {
    const { loadBinders, getActiveBinder, assignCardToSlot, clearSlot } = await load();
    await loadBinders();
    const { id } = getActiveBinder();

    await assignCardToSlot(id, '0:0:0', 'card-a');
    expect(getActiveBinder().slots['0:0:0']).toBe('card-a');
    expect(local.records[0].slots['0:0:0']).toBe('card-a');

    await clearSlot(id, '0:0:0');
    expect(getActiveBinder().slots['0:0:0']).toBeUndefined();
  });

  it('rejects malformed slot keys and empty printing ids', async () => {
    const { loadBinders, getActiveBinder, assignCardToSlot } = await load();
    await loadBinders();
    const { id } = getActiveBinder();

    expect(await assignCardToSlot(id, 'bad', 'card-a')).toBeNull();
    expect(await assignCardToSlot(id, '0:0:0', '')).toBeNull();
    expect(getActiveBinder().slots).toEqual({});
  });

  it('moves a card into an empty pocket and swaps into a filled one', async () => {
    const { loadBinders, getActiveBinder, assignCardToSlot, moveSlot } = await load();
    await loadBinders();
    const { id } = getActiveBinder();

    await assignCardToSlot(id, '0:0:0', 'card-a');
    await assignCardToSlot(id, '0:0:1', 'card-b');

    // Move into empty.
    await moveSlot(id, '0:0:0', '0:1:0');
    expect(getActiveBinder().slots['0:1:0']).toBe('card-a');
    expect(getActiveBinder().slots['0:0:0']).toBeUndefined();

    // Swap into occupied.
    await moveSlot(id, '0:1:0', '0:0:1');
    expect(getActiveBinder().slots['0:0:1']).toBe('card-a');
    expect(getActiveBinder().slots['0:1:0']).toBe('card-b');
  });

  it('moves a card to the first empty pocket of another binder', async () => {
    const {
      loadBinders,
      getActiveBinder,
      getBinder,
      createBinder,
      assignCardToSlot,
      moveCardToFirstEmptySlot,
    } = await load();
    await loadBinders();
    const first = getActiveBinder();
    const second = await createBinder({ name: 'Second', columns: 2, rows: 2, pages: 1 });

    await assignCardToSlot(first.id, '0:0:0', 'card-a');
    // Occupy the destination's first pocket so the card lands in the next one.
    await assignCardToSlot(second.id, '0:0:0', 'card-z');

    await moveCardToFirstEmptySlot(first.id, '0:0:0', second.id);

    expect(getBinder(first.id).slots['0:0:0']).toBeUndefined();
    expect(getBinder(second.id).slots['0:0:0']).toBe('card-z');
    expect(getBinder(second.id).slots['0:0:1']).toBe('card-a');
  });

  it('grows the destination binder when it is full', async () => {
    const {
      loadBinders,
      getActiveBinder,
      getBinder,
      createBinder,
      assignCardToSlot,
      moveCardToFirstEmptySlot,
    } = await load();
    await loadBinders();
    const first = getActiveBinder();
    const second = await createBinder({ name: 'Tiny', columns: 1, rows: 1, pages: 1 });

    await assignCardToSlot(first.id, '0:0:0', 'card-a');
    await assignCardToSlot(second.id, '0:0:0', 'filler');

    await moveCardToFirstEmptySlot(first.id, '0:0:0', second.id);

    expect(getBinder(second.id).pages).toBe(2);
    expect(getBinder(second.id).slots['1:0:0']).toBe('card-a');
  });

  it('clears only the requested page', async () => {
    const { loadBinders, getActiveBinder, assignCardToSlot, clearPage } = await load();
    await loadBinders();
    const { id } = getActiveBinder();

    await assignCardToSlot(id, '0:0:0', 'page-0-card');
    await assignCardToSlot(id, '1:0:0', 'page-1-card');

    await clearPage(id, 0);
    expect(getActiveBinder().slots['0:0:0']).toBeUndefined();
    expect(getActiveBinder().slots['1:0:0']).toBe('page-1-card');
  });

  it('lists a binder\u2019s cards in slot order, one per name', async () => {
    const { loadBinders, getActiveBinder, assignCardToSlot, getBinderCards, getBinderPrintingIds } =
      await load();
    cardStore.add({ id: 'card-a', name: 'Alpha' });
    cardStore.add({ id: 'card-b', name: 'Beta' });
    await loadBinders();
    const binder = getActiveBinder();

    // Insert out of order to prove the slot sort (page, row, column).
    await assignCardToSlot(binder.id, '0:1:0', 'card-b');
    await assignCardToSlot(binder.id, '0:0:0', 'card-a');

    expect(getBinderPrintingIds(binder.id)).toEqual(['card-a', 'card-b']);
    expect(getBinderCards(binder.id).map((card) => card.name)).toEqual(['Alpha', 'Beta']);
  });

  it('lists one card per pocket, keeping duplicates, in slot order', async () => {
    const { loadBinders, getActiveBinder, assignCardToSlot, getBinderSlotCards } = await load();
    cardStore.add({ id: 'card-a', name: 'Alpha' });
    await loadBinders();
    const binder = getActiveBinder();

    await assignCardToSlot(binder.id, '0:0:1', 'card-a');
    await assignCardToSlot(binder.id, '0:0:0', 'card-a');

    expect(getBinderSlotCards(binder.id).map((card) => card.id)).toEqual(['card-a', 'card-a']);
  });

  it('is name-aware when checking binder membership', async () => {
    const { loadBinders, getActiveBinder, assignCardToSlot, isCardInBinder } = await load();
    cardStore.add({ id: 'card-a', name: 'Alpha' });
    await loadBinders();
    const binder = getActiveBinder();
    await assignCardToSlot(binder.id, '0:0:0', 'card-a');

    // Another printing of the same name still counts as present.
    expect(isCardInBinder(binder.id, { id: 'other-printing', name: 'Alpha' })).toBe(true);
    expect(isCardInBinder(binder.id, { id: 'card-x', name: 'Gamma' })).toBe(false);
  });

  it('bulk-fills empty pockets and grows the page count when needed', async () => {
    const { loadBinders, getActiveBinder, updateBinder, addCardsToBinder } = await load();
    await loadBinders();
    const binder = getActiveBinder();
    await updateBinder(binder.id, { columns: 2, rows: 2, pages: 1 }); // 4 pockets

    const cards = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }));
    await addCardsToBinder(binder.id, cards);

    const updated = getActiveBinder();
    expect([...Object.values(updated.slots)].sort()).toEqual(cards.map((card) => card.id).sort());
    expect(updated.pages).toBe(2);
  });

  it('skips cards already in the binder when bulk-filling', async () => {
    const { loadBinders, getActiveBinder, assignCardToSlot, addCardsToBinder } = await load();
    await loadBinders();
    const binder = getActiveBinder();
    await assignCardToSlot(binder.id, '0:0:0', 'c0');

    await addCardsToBinder(binder.id, [
      { id: 'c0', name: 'C0' },
      { id: 'c1', name: 'C1' },
    ]);

    const ids = Object.values(getActiveBinder().slots);
    expect(ids.filter((id) => id === 'c0')).toHaveLength(1);
    expect(ids).toContain('c1');
  });

  it('refuses to rename a binder to an existing name', async () => {
    const { loadBinders, createBinder, updateBinder, getBinders, getBinderByName } = await load();
    await loadBinders();

    const second = await createBinder({ name: 'Second' });
    const first = getBinders().find((binder) => binder.id !== second.id);

    await updateBinder(second.id, { name: first.name });

    expect(getBinderByName('Second').id).toBe(second.id);
    expect(getBinderByName(first.name).id).toBe(first.id);
  });

  it('reseeds an empty binder when the last one is deleted', async () => {
    const { loadBinders, deleteBinder, getBinders } = await load();
    await loadBinders();
    const [binder] = getBinders();

    await deleteBinder(binder.id);
    expect(getBinders()).toHaveLength(1);
    expect(getBinders()[0].id).not.toBe(binder.id);
  });

  it('announces changes so the editor can repaint', async () => {
    const { loadBinders, getActiveBinder, assignCardToSlot } = await load();
    await loadBinders();
    const { id } = getActiveBinder();

    const listener = vi.fn();
    document.addEventListener('binders:changed', listener);
    await assignCardToSlot(id, '0:0:0', 'card-a');
    document.removeEventListener('binders:changed', listener);

    expect(listener).toHaveBeenCalled();
  });

  describe('resizeBinder', () => {
    it('shifts displaced cards into free pockets when shrinking', async () => {
      const { loadBinders, getActiveBinder, assignCardToSlot, resizeBinder } = await load();
      await loadBinders();
      const binder = getActiveBinder();
      await assignCardToSlot(binder.id, '0:0:2', 'card-a');

      const { overflow } = await resizeBinder(binder.id, { columns: 2, rows: 3, pages: 1 });

      expect(overflow).toEqual([]);
      expect(getActiveBinder().slots).toEqual({ '0:0:0': 'card-a' });
    });

    it('moves cards that no longer fit into a new continuation binder', async () => {
      const {
        loadBinders,
        getActiveBinder,
        getBinder,
        getBinders,
        assignCardToSlot,
        resizeBinder,
      } = await load();
      await loadBinders();
      const binder = getActiveBinder();
      await assignCardToSlot(binder.id, '0:0:0', 'card-a');
      await assignCardToSlot(binder.id, '0:0:1', 'card-b');
      await assignCardToSlot(binder.id, '0:0:2', 'card-c');

      const { overflow } = await resizeBinder(binder.id, { columns: 1, rows: 1, pages: 1 });

      expect(getBinder(binder.id).slots).toEqual({ '0:0:0': 'card-a' });
      expect(overflow).toHaveLength(1);
      expect(overflow[0].name).toBe('Binder 1 (2)');
      expect(overflow[0].count).toBe(2);
      expect(getBinder(overflow[0].id).slots).toEqual({
        '0:0:0': 'card-b',
        '1:0:0': 'card-c',
      });
      expect(getBinders()).toHaveLength(2);
    });

    it('keeps every pocket that still fits when growing', async () => {
      const { loadBinders, getActiveBinder, assignCardToSlot, resizeBinder } = await load();
      await loadBinders();
      const binder = getActiveBinder();
      await assignCardToSlot(binder.id, '0:0:0', 'card-a');
      await assignCardToSlot(binder.id, '0:1:1', 'card-b');

      const { overflow } = await resizeBinder(binder.id, { columns: 4, rows: 3, pages: 2 });

      expect(overflow).toEqual([]);
      expect(getActiveBinder().slots).toEqual({ '0:0:0': 'card-a', '0:1:1': 'card-b' });
    });

    it('leaves the active binder on the one that was resized', async () => {
      const {
        loadBinders,
        getActiveBinder,
        createBinder,
        setActiveBinder,
        assignCardToSlot,
        resizeBinder,
      } = await load();
      await loadBinders();
      const source = getActiveBinder();
      await createBinder({ name: 'Other', columns: 1, rows: 1, pages: 1 });
      setActiveBinder(source.id);
      await assignCardToSlot(source.id, '0:0:0', 'card-a');
      await assignCardToSlot(source.id, '0:0:1', 'card-b');

      await resizeBinder(source.id, { columns: 1, rows: 1, pages: 1 });

      expect(getActiveBinder().id).toBe(source.id);
    });

    it('does nothing when the dimensions are unchanged', async () => {
      const { loadBinders, getActiveBinder, resizeBinder } = await load();
      await loadBinders();
      const binder = getActiveBinder();

      const result = await resizeBinder(binder.id, {
        columns: binder.columns,
        rows: binder.rows,
        pages: binder.pages,
      });

      expect(result.overflow).toEqual([]);
      expect(getActiveBinder().columns).toBe(binder.columns);
    });
  });

  describe('deleteBinder', () => {
    it('selects the next binder and persists it when the active one is deleted', async () => {
      const { loadBinders, createBinder, getActiveBinder, setActiveBinder, deleteBinder } =
        await load();
      await loadBinders();
      const second = await createBinder({ name: 'Binder 2' });
      const third = await createBinder({ name: 'Binder 3' });

      setActiveBinder(second.id);
      await deleteBinder(second.id);

      expect(getActiveBinder().id).toBe(third.id);
      expect(localStorage.getItem('activeBinderId')).toBe(third.id);
    });

    it('falls back to the previous binder when the active last one is deleted', async () => {
      const { loadBinders, createBinder, getActiveBinder, setActiveBinder, deleteBinder } =
        await load();
      await loadBinders();
      const second = await createBinder({ name: 'Binder 2' });
      const third = await createBinder({ name: 'Binder 3' });

      setActiveBinder(third.id);
      await deleteBinder(third.id);

      expect(getActiveBinder().id).toBe(second.id);
      expect(localStorage.getItem('activeBinderId')).toBe(second.id);
    });

    it('keeps the active binder when a different one is deleted', async () => {
      const { loadBinders, createBinder, getActiveBinder, setActiveBinder, deleteBinder } =
        await load();
      await loadBinders();
      const first = getActiveBinder();
      const second = await createBinder({ name: 'Binder 2' });
      await createBinder({ name: 'Binder 3' });

      setActiveBinder(second.id);
      await deleteBinder(first.id);

      expect(getActiveBinder().id).toBe(second.id);
    });
  });
});
