import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({ lists: [], canEdit: true }));

vi.mock('../../../state/listsState.js', () => ({
  canEditLists: vi.fn(() => state.canEdit),
  getLists: vi.fn(() => state.lists),
  getList: vi.fn((id) => state.lists.find((list) => list.id === id) || null),
  loadLists: vi.fn(async () => {}),
  createList: vi.fn(async () => state.lists[0] || null),
  updateList: vi.fn(async () => {}),
  deleteList: vi.fn(async () => {}),
  addCardsToList: vi.fn(async () => {}),
}));

vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../../state/selectionState.js', () => ({
  getSelectedCards: vi.fn(() => []),
  getSelectedCount: vi.fn(() => 0),
  isSelectionMode: vi.fn(() => false),
}));

import { createListsModal } from '../listsModal.js';
import * as listsState from '../../../state/listsState.js';

function makeList(overrides = {}) {
  return {
    id: 'L1',
    name: 'Trade pile',
    notes: 'spares',
    isPublic: false,
    cardIds: new Set(['a', 'b']),
    ...overrides,
  };
}

beforeEach(() => {
  state.canEdit = true;
  state.lists = [makeList()];
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

afterEach(() => {
  document.querySelectorAll('.list-modal-backdrop').forEach((el) => el.remove());
});

describe('listsModal', () => {
  it('shows the selected list name, notes and count', () => {
    createListsModal().show();

    expect(document.querySelector('input[aria-label="List name"]').value).toBe('Trade pile');
    expect(document.querySelector('textarea[aria-label="List notes"]').value).toBe('spares');
    expect(document.querySelector('.lists-count').textContent).toContain('2 cards');
  });

  it('creates a list through the inline form', async () => {
    state.lists = [];
    createListsModal().show();

    document.querySelector('.lists-new').click();
    const name = document.querySelector('.lists-form input[aria-label="List name"]');
    const notes = document.querySelector('.lists-form textarea[aria-label="List notes"]');
    name.value = 'Deck: Atraxa';
    notes.value = 'plan';
    document
      .querySelector('.lists-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(listsState.createList).toHaveBeenCalled());
    expect(listsState.createList).toHaveBeenCalledWith({
      name: 'Deck: Atraxa',
      notes: 'plan',
      isPublic: false,
    });
  });

  it('saves edits to the selected list', async () => {
    createListsModal().show();

    const name = document.querySelector('input[aria-label="List name"]');
    name.value = 'Renamed';
    document
      .querySelector('.lists-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(listsState.updateList).toHaveBeenCalled());
    expect(listsState.updateList).toHaveBeenCalledWith('L1', {
      name: 'Renamed',
      notes: 'spares',
      isPublic: false,
    });
  });

  it('requires a second click to delete', async () => {
    createListsModal().show();

    const deleteButton = [...document.querySelectorAll('.lists-form-actions button')].find(
      (button) => button.textContent === 'Delete'
    );
    deleteButton.click();
    expect(listsState.deleteList).not.toHaveBeenCalled();

    const confirm = [...document.querySelectorAll('.lists-form-actions button')].find(
      (button) => button.textContent === 'Confirm delete'
    );
    confirm.click();

    await vi.waitFor(() => expect(listsState.deleteList).toHaveBeenCalledWith('L1'));
  });

  it('renders read-only in a share view', () => {
    state.canEdit = false;
    createListsModal().show();

    expect(document.querySelector('.lists-new')).toBeNull();
    expect(document.querySelector('input[aria-label="List name"]').disabled).toBe(true);
    expect(
      [...document.querySelectorAll('.lists-form-actions button')].some(
        (button) => button.textContent === 'Delete'
      )
    ).toBe(false);
  });
});
