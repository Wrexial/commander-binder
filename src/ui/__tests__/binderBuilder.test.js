import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/** In-memory stand-ins for IndexedDB and the picker. */
const local = vi.hoisted(() => ({ records: [] }));
const pickerState = vi.hoisted(() => ({
  options: null,
  show: vi.fn(),
  close: vi.fn(),
}));
const printingState = vi.hoisted(() => ({ options: null, show: vi.fn() }));

vi.mock('../../state/localBinders.js', () => ({
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

vi.mock('../../state/cardSettings.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSetting: vi.fn((key) => ({ gridColumns: 3, gridRows: 3, pagesPerBinder: 1 })[key]),
}));

vi.mock('../../state/cardStore.js', () => ({
  cardStore: {
    getByPrintingId: vi.fn((id) => (id ? { id, name: `Card ${id}` } : null)),
    getPrintings: vi.fn((name) => [
      { id: 'printing-a', name },
      { id: 'printing-b', name },
    ]),
  },
}));

vi.mock('../cards.js', () => ({
  createCardElement: vi.fn(() => {
    const el = document.createElement('div');
    el.className = 'card';
    return el;
  }),
  updateCardState: vi.fn(),
}));

vi.mock('../components/cardPickerModal.js', () => ({
  createCardPickerModal: vi.fn((options) => {
    pickerState.options = options;
    return { show: pickerState.show, close: pickerState.close, destroy: vi.fn() };
  }),
}));

vi.mock('../components/printingPickerModal.js', () => ({
  createPrintingPickerModal: vi.fn((options) => {
    printingState.options = options;
    return { show: printingState.show, close: vi.fn(), destroy: vi.fn() };
  }),
}));

vi.mock('../components/toast.js', () => ({ showToast: vi.fn() }));

vi.mock('../../api/cardSearch.js', () => ({
  hydrateCardsByIds: vi.fn(async () => []),
  ensurePrintingsLoaded: vi.fn(async () => undefined),
}));

vi.mock('../../api/binders.js', () => ({
  fetchBinders: vi.fn(async () => []),
  createBinder: vi.fn(),
  updateBinder: vi.fn(),
  deleteBinder: vi.fn(),
  mergeBinders: vi.fn(),
}));

import { initBinderBuilder, teardownBinderBuilder } from '../binderBuilder.js';
import {
  assignCardToSlot,
  createBinder,
  getActiveBinder,
  getActiveBinderId,
  getBinder,
  resetBinders,
  setActiveBinder,
  updateBinder,
} from '../../state/bindersState.js';
import { mainState } from '../../state/mainState.js';
import { fetchBinders } from '../../api/binders.js';

async function mount() {
  const root = document.getElementById('binder-root');
  await initBinderBuilder(root);
  return root;
}

beforeEach(async () => {
  local.records = [];
  localStorage.clear();
  mainState.shareToken = undefined;
  document.body.innerHTML = '<div id="binder-root"></div>';
  pickerState.options = null;
  pickerState.show.mockClear();
  printingState.options = null;
  printingState.show.mockClear();
  await resetBinders();
});

afterEach(() => {
  teardownBinderBuilder();
  document.body.innerHTML = '';
});

describe('binderBuilder', () => {
  it('renders an empty page of pockets', async () => {
    await mount();

    expect(document.querySelectorAll('.binder-slot')).toHaveLength(9);
    expect(document.querySelectorAll('.binder-slot-add')).toHaveLength(9);
    expect(document.querySelector('.bb-page-label').textContent).toBe('Page 1 / 1');
  });

  it('defers seeding when mounted with seed: false', async () => {
    await initBinderBuilder(document.getElementById('binder-root'), { seed: false });

    // The shell seeds once guest→account merges have settled; until then the
    // editor stays empty rather than creating a spurious "Binder 1".
    expect(getActiveBinder()).toBeNull();
    expect(document.querySelectorAll('.binder-slot')).toHaveLength(0);
    expect(document.querySelector('.binder-builder-empty').hidden).toBe(false);
  });

  it('caps displayed pocket columns on phones without changing the binder layout', async () => {
    await mount();
    const binder = getActiveBinder();
    await updateBinder(binder.id, { columns: 5, rows: 2, pages: 1 });

    const page = document.getElementById('binder-page');
    expect(page.style.getPropertyValue('--binder-columns')).toBe('5');
    expect(page.style.getPropertyValue('--binder-columns-mobile')).toBe('3');

    // The stored layout is untouched, so no cards shift and no continuation is
    // created.
    expect(getActiveBinder().columns).toBe(5);
    expect(getActiveBinder().rows).toBe(2);
  });

  it('opens the picker for an empty pocket and places the chosen card', async () => {
    await mount();

    document.querySelector('.binder-slot-add').click();
    expect(pickerState.show).toHaveBeenCalledTimes(1);
    expect(pickerState.options).not.toBeNull();

    pickerState.options.onPick({ id: 'card-a', name: 'Card A' });

    await vi.waitFor(() => {
      expect(getActiveBinder().slots['0:0:0']).toBe('card-a');
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.binder-slot.is-filled')).not.toBeNull();
    });
  });

  it('removes a card from a pocket', async () => {
    await mount();
    const binder = getActiveBinder();
    await assignCardToSlot(binder.id, '0:0:0', 'card-a');

    await vi.waitFor(() => expect(document.querySelector('.binder-slot-remove')).not.toBeNull());
    document.querySelector('.binder-slot-remove').click();

    await vi.waitFor(() => {
      expect(getActiveBinder().slots['0:0:0']).toBeUndefined();
    });
  });

  it('moves a card to another pocket through move mode', async () => {
    await mount();
    const binder = getActiveBinder();
    await assignCardToSlot(binder.id, '0:0:0', 'card-a');
    await assignCardToSlot(binder.id, '0:0:1', 'card-b');

    await vi.waitFor(() => expect(document.querySelectorAll('.binder-slot-move')).toHaveLength(2));

    document.querySelector('.binder-slot[data-slot="0:0:0"] .binder-slot-move').click();
    await vi.waitFor(() => expect(document.querySelector('.bb-status').hidden).toBe(false));

    document.querySelector('.binder-slot[data-slot="0:1:0"]').click();

    await vi.waitFor(() => {
      expect(getActiveBinder().slots['0:1:0']).toBe('card-a');
      expect(getActiveBinder().slots['0:0:0']).toBeUndefined();
    });
  });

  it('opens the printing picker for a pocket and saves the chosen printing', async () => {
    await mount();
    const binder = getActiveBinder();
    await assignCardToSlot(binder.id, '0:0:0', 'printing-a');
    await vi.waitFor(() => expect(document.querySelector('.binder-slot-printings')).not.toBeNull());

    document.querySelector('.binder-slot-printings').click();

    await vi.waitFor(() => expect(printingState.options).not.toBeNull());
    expect(printingState.options.currentId).toBe('printing-a');
    expect(printingState.show).toHaveBeenCalled();

    printingState.options.onPick({ id: 'printing-b' });
    await vi.waitFor(() => expect(getActiveBinder().slots['0:0:0']).toBe('printing-b'));
  });

  it('saves a pocket printing when the shared interactions cycle it', async () => {
    await mount();
    const binder = getActiveBinder();
    await assignCardToSlot(binder.id, '0:0:0', 'printing-a');
    await vi.waitFor(() => expect(document.querySelector('.binder-slot.is-filled')).not.toBeNull());

    document.dispatchEvent(
      new CustomEvent('binder:printing-changed', {
        detail: { slotKey: '0:0:0', printingId: 'printing-b' },
      })
    );

    await vi.waitFor(() => expect(getActiveBinder().slots['0:0:0']).toBe('printing-b'));
  });

  it('moves a card to another binder when switching tabs during a move', async () => {
    await mount();
    const first = getActiveBinder();
    await assignCardToSlot(first.id, '0:0:0', 'card-a');

    const second = await createBinder({ name: 'Second' });
    setActiveBinder(first.id);

    await vi.waitFor(() => expect(document.querySelectorAll('.binder-tab')).toHaveLength(2));

    // Enter move mode on the first binder's card.
    document.querySelector('.binder-slot[data-slot="0:0:0"] .binder-slot-move').click();
    await vi.waitFor(() => expect(document.querySelector('.bb-status').hidden).toBe(false));

    // Switching to "Second" drops the card in its first empty pocket.
    [...document.querySelectorAll('.binder-tab')]
      .find((tab) => tab.textContent === 'Second')
      .click();

    await vi.waitFor(() => {
      expect(getActiveBinderId()).toBe(second.id);
      expect(getBinder(second.id).slots['0:0:0']).toBe('card-a');
      expect(getBinder(first.id).slots['0:0:0']).toBeUndefined();
    });
  });

  it('navigates pages and clears the current page', async () => {
    await mount();
    const binder = getActiveBinder();
    await updateBinder(binder.id, { pages: 2 });
    await assignCardToSlot(binder.id, '1:0:0', 'page-2-card');

    await vi.waitFor(() =>
      expect(document.querySelector('.bb-page-label').textContent).toBe('Page 1 / 2')
    );

    document.querySelector('.bb-next').click();
    await vi.waitFor(() =>
      expect(document.querySelector('.bb-page-label').textContent).toBe('Page 2 / 2')
    );
    expect(
      document.querySelector('.binder-slot[data-slot="1:0:0"]').classList.contains('is-filled')
    ).toBe(true);

    document.querySelector('.bb-clear-page').click();
    await vi.waitFor(() => {
      expect(getActiveBinder().slots['1:0:0']).toBeUndefined();
    });
  });

  it('renames the active binder', async () => {
    await mount();

    const input = document.querySelector('.bb-name');
    input.value = 'Trade binder';
    input.dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect(getActiveBinder().name).toBe('Trade binder'));
  });

  it('creates a new binder', async () => {
    await mount();

    document.querySelector('.bb-new').click();

    await vi.waitFor(() => expect(document.querySelectorAll('.binder-tab')).toHaveLength(2));
  });

  it('switches the active binder from the top tabs', async () => {
    await mount();
    await createBinder({ name: 'Second' });

    await vi.waitFor(() => expect(document.querySelectorAll('.binder-tab')).toHaveLength(2));

    // The first tab is the original "Binder 1"; clicking it makes it active
    // (the tabs are rebuilt, so re-query rather than holding the old node).
    document.querySelectorAll('.binder-tab')[0].click();

    await vi.waitFor(() =>
      expect(document.querySelectorAll('.binder-tab')[0].classList.contains('is-active')).toBe(true)
    );
  });

  it('moves between binder tabs with the arrow keys', async () => {
    await mount();
    await createBinder({ name: 'Second' });
    await vi.waitFor(() => expect(document.querySelectorAll('.binder-tab')).toHaveLength(2));

    const tabs = () => [...document.querySelectorAll('.binder-tab')];
    const activeIndex = () => tabs().findIndex((tab) => tab.classList.contains('is-active'));

    // Creating a binder makes it active; ArrowLeft returns to the first tab.
    const active = tabs()[activeIndex()];
    active.focus();
    expect(active.tabIndex).toBe(0);
    active.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    await vi.waitFor(() => expect(activeIndex()).toBe(0));
    expect(tabs()[0].tabIndex).toBe(0);
    expect(tabs()[1].tabIndex).toBe(-1);
  });

  it('renders a read-only view for a share visitor', async () => {
    mainState.shareToken = 'tok';
    fetchBinders.mockResolvedValueOnce([
      {
        id: 'pub',
        name: 'Shared binder',
        columns: 3,
        rows: 3,
        pages: 1,
        isPublic: true,
        slots: { '0:0:0': 'card-a' },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    await mount();

    // No editing affordances at all.
    expect(document.querySelectorAll('.binder-slot-add')).toHaveLength(0);
    expect(document.querySelector('.bb-new').hidden).toBe(true);
    expect(document.querySelector('.bb-delete').hidden).toBe(true);
    expect(document.querySelector('.bb-clear-page').hidden).toBe(true);
    expect(document.querySelector('.bb-name').disabled).toBe(true);
    expect(document.querySelector('.bb-public').disabled).toBe(true);
    expect(document.querySelectorAll('.binder-slot-controls')).toHaveLength(0);
    expect(document.querySelector('.binder-builder-hint').textContent).toContain('View only');

    // The owner's public binder is visible, with its card.
    expect(document.querySelector('.binder-slot.is-filled')).not.toBeNull();
  });

  it('shows an empty state when a share visitor has no public binders', async () => {
    mainState.shareToken = 'tok';
    fetchBinders.mockResolvedValueOnce([]);

    await mount();

    const empty = document.querySelector('.binder-builder-empty');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain('shared');
  });
});
