import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Test-controlled state for the mocked sources. */
const state = vi.hoisted(() => ({
  sidebar: {},
  cards: [],
  lists: [],
  listCards: {},
  binders: [],
  binderIds: {},
  binderCards: {},
  owned: new Set(),
  wanted: new Set(),
}));

vi.mock('../ui/components/sidebar.js', () => ({
  addButtonToSidebar: vi.fn((_text, onClick) => {
    state.sidebar[_text] = onClick;
  }),
}));

vi.mock('../state/cardStore.js', () => ({
  cardStore: {
    getAll: vi.fn(() => state.cards),
    getByPrintingId: vi.fn((id) => state.cards.find((card) => card.id === id) || null),
  },
}));

vi.mock('../state/cardState.js', () => ({
  isCardOwned: vi.fn((card) => state.owned.has(card.id)),
}));
vi.mock('../state/wishlistState.js', () => ({
  isCardWanted: vi.fn((card) => state.wanted.has(card.id)),
}));
vi.mock('../state/listsState.js', () => ({
  getLists: vi.fn(() => state.lists),
  getListCards: vi.fn((id) => state.listCards[id] || []),
}));
vi.mock('../state/bindersState.js', () => ({
  getBinders: vi.fn(() => state.binders),
  getBinderPrintingIds: vi.fn((id) => state.binderIds[id] || []),
  getBinderCards: vi.fn((id) => state.binderCards[id] || []),
  getActiveBinderId: vi.fn(() => null),
}));
vi.mock('../api/cardSearch.js', () => ({ hydrateCardsByIds: vi.fn(async () => []) }));
vi.mock('../ui/components/toast.js', () => ({ showToast: vi.fn() }));
vi.mock('../ui/components/exportModal.js', () => ({
  createExportModal: vi.fn(() => ({ show: vi.fn() })),
}));

import { createExportButton } from '../ui/layout.js';
import { createExportModal } from '../ui/components/exportModal.js';
import { showToast } from '../ui/components/toast.js';
import { hydrateCardsByIds } from '../api/cardSearch.js';

function clickExport() {
  return state.sidebar['📄 Export Cards']();
}

beforeEach(() => {
  vi.clearAllMocks();
  state.cards = [];
  state.lists = [];
  state.listCards = {};
  state.binders = [];
  state.binderIds = {};
  state.binderCards = {};
  state.owned = new Set();
  state.wanted = new Set();
  document.body.innerHTML = '';
  createExportButton();
});

describe('export button collections', () => {
  it('assembles the owned, wishlist, list and binder collections', async () => {
    state.cards = [
      { id: 'a', name: 'Sol Ring' },
      { id: 'b', name: 'Arcane Signet' },
    ];
    state.owned = new Set(['a']);
    state.wanted = new Set(['b']);
    state.lists = [{ id: 'L1', name: 'Trade pile' }];
    state.listCards = { L1: [{ id: 'a', name: 'Sol Ring' }] };
    state.binders = [{ id: 'B1', name: 'Deck: Atraxa' }];
    state.binderIds = { B1: ['a'] };
    state.binderCards = { B1: [{ id: 'a', name: 'Sol Ring' }] };

    await clickExport();

    expect(createExportModal).toHaveBeenCalledTimes(1);
    const { collections } = createExportModal.mock.calls[0][0];
    expect(collections.map((collection) => collection.id)).toEqual([
      'owned',
      'wishlist',
      'list:L1',
      'binder:B1',
    ]);
    expect(collections[0].cards).toEqual([{ id: 'a', name: 'Sol Ring' }]);
    expect(collections[1].cards).toEqual([{ id: 'b', name: 'Arcane Signet' }]);
    // List and binder names are slugified for the download filename.
    expect(collections[2].filePrefix).toBe('list-trade-pile');
    expect(collections[3].filePrefix).toBe('binder-deck-atraxa');
  });

  it('hydrates binder printings that are not loaded before exporting', async () => {
    state.binders = [{ id: 'B1', name: 'Deck' }];
    state.binderIds = { B1: ['missing-1'] };
    state.binderCards = { B1: [{ id: 'missing-1', name: 'missing-1' }] };

    await clickExport();

    expect(hydrateCardsByIds).toHaveBeenCalledWith(['missing-1']);
  });

  it('toasts instead of opening the modal when there is nothing to export', async () => {
    await clickExport();

    expect(showToast).toHaveBeenCalledWith('Nothing to export yet.');
    expect(createExportModal).not.toHaveBeenCalled();
  });

  it('does not open over an already-open dialog', async () => {
    state.cards = [{ id: 'a', name: 'Sol Ring' }];
    state.owned = new Set(['a']);
    const backdrop = document.createElement('div');
    backdrop.className = 'list-modal-backdrop';
    document.body.appendChild(backdrop);

    await clickExport();

    expect(createExportModal).not.toHaveBeenCalled();
  });
});
