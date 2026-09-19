import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/** In-memory stand-ins for IndexedDB and the picker. */
const local = vi.hoisted(() => ({ records: [] }));
const pickerState = vi.hoisted(() => ({
  options: null,
  show: vi.fn(),
  close: vi.fn(),
}));

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

vi.mock('../components/toast.js', () => ({ showToast: vi.fn() }));

import { initBinderBuilder, teardownBinderBuilder } from '../binderBuilder.js';
import {
  assignCardToSlot,
  getActiveBinder,
  resetBinders,
  updateBinder,
} from '../../state/bindersState.js';

async function mount() {
  const root = document.getElementById('binder-root');
  await initBinderBuilder(root);
  return root;
}

beforeEach(async () => {
  local.records = [];
  localStorage.clear();
  document.body.innerHTML = '<div id="binder-root"></div>';
  pickerState.options = null;
  pickerState.show.mockClear();
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

    await vi.waitFor(() =>
      expect(document.querySelectorAll('.bb-binder-select option')).toHaveLength(2)
    );
  });
});
