import { describe, it, expect, vi, beforeEach } from 'vitest';

// These tests exercise the real `listsState` (the point is that the Add modal
// reads the same registry the app loads), so only its leaf dependencies are
// mocked.
const localStore = vi.hoisted(() => ({ rows: [] }));

vi.mock('../../../state/mainState.js', () => ({
  mainState: { loggedInUserId: null, shareToken: null },
}));
vi.mock('../../../api/lists.js', () => ({
  fetchLists: vi.fn(async () => []),
  createList: vi.fn(async () => []),
  updateList: vi.fn(async () => []),
  deleteList: vi.fn(async () => []),
  addListItems: vi.fn(async () => []),
  removeListItems: vi.fn(async () => []),
  mergeLists: vi.fn(async () => []),
}));
vi.mock('../../../state/localLists.js', () => ({
  loadLocalLists: vi.fn(async () => localStore.rows),
  saveLocalList: vi.fn(async () => true),
  removeLocalList: vi.fn(async () => true),
  clearLocalLists: vi.fn(async () => true),
}));
vi.mock('../../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []), getPrintings: vi.fn(() => []), getByPrintingId: vi.fn() },
  primaryName: (cardOrName) => (typeof cardOrName === 'string' ? cardOrName : cardOrName?.name),
}));
vi.mock('../../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  setCardsOwned: vi.fn(async () => {}),
}));
vi.mock('../../../state/wishlistState.js', () => ({
  isCardWanted: vi.fn(() => false),
  setCardsWanted: vi.fn(async () => {}),
}));
vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { loadLists } from '../../../state/listsState.js';
import { createAddCardsModal } from '../addCardsModal.js';

beforeEach(() => {
  document.body.innerHTML = '';
  localStore.rows = [
    {
      id: 'L1',
      name: 'Trade pile',
      notes: '',
      isPublic: false,
      cardIds: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];
});

describe('addCardsModal list targets', () => {
  it('surfaces loaded custom lists in the target picker', async () => {
    await loadLists();

    createAddCardsModal().show();

    const labels = [...document.querySelectorAll('.target-toggle-option')].map(
      (button) => button.textContent
    );
    expect(labels).toEqual(['Collection', 'Wishlist', 'Trade pile', '+ New list']);
  });

  it('creates a new list from the picker and targets it', async () => {
    await loadLists();
    createAddCardsModal().show();

    document.querySelector('.target-toggle-new').click();
    const input = document.querySelector('.target-new-list-form input');
    expect(input).not.toBeNull();
    input.value = 'Deck: Atraxa';
    document
      .querySelector('.target-new-list-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() =>
      expect(document.querySelector('.bulk-modal-header h2').textContent).toBe(
        'Add to “Deck: Atraxa”'
      )
    );
    const labels = [...document.querySelectorAll('.target-toggle-option')].map(
      (button) => button.textContent
    );
    expect(labels).toEqual(['Collection', 'Wishlist', 'Trade pile', 'Deck: Atraxa', '+ New list']);
  });
});
