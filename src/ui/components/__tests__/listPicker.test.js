import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({ lists: [], members: new Set(), canEdit: true }));

vi.mock('../../../state/listsState.js', () => ({
  canEditLists: vi.fn(() => state.canEdit),
  getLists: vi.fn(() => state.lists),
  isInList: vi.fn((id) => state.members.has(id)),
  createList: vi.fn(async ({ name }) => ({ id: 'new-list', name })),
  toggleCardInList: vi.fn(async (id) => {
    if (state.members.has(id)) state.members.delete(id);
    else state.members.add(id);
    return state.members.has(id);
  }),
}));

vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));

import { createListPicker } from '../listPicker.js';
import { updateAllCardStates } from '../../cards.js';
import * as listsState from '../../../state/listsState.js';

const CARD = { id: 'p1', name: 'Atraxa' };

beforeEach(() => {
  state.canEdit = true;
  state.members = new Set();
  state.lists = [
    { id: 'L1', name: 'Trade pile', cardIds: new Set(['a']) },
    { id: 'L2', name: 'Deck: Atraxa', cardIds: new Set() },
  ];
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

afterEach(() => {
  document.querySelectorAll('.list-modal-backdrop').forEach((el) => el.remove());
});

describe('listPicker', () => {
  it('lists every list and toggles membership', async () => {
    createListPicker().show(CARD);

    const rows = [...document.querySelectorAll('.list-picker-row')];
    expect(rows.map((row) => row.querySelector('.list-picker-name').textContent)).toEqual([
      'Trade pile',
      'Deck: Atraxa',
    ]);

    rows[0].click();
    await vi.waitFor(() => expect(listsState.toggleCardInList).toHaveBeenCalledWith('L1', CARD));
    expect(updateAllCardStates).toHaveBeenCalled();
  });

  it('creates a list and adds the card in one step', async () => {
    createListPicker().show(CARD);

    document.querySelector('.list-picker-new-toggle').click();
    const input = document.querySelector('.list-picker-new input');
    input.value = 'Deck: New';
    document
      .querySelector('.list-picker-new')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(listsState.createList).toHaveBeenCalled());
    expect(listsState.toggleCardInList).toHaveBeenCalledWith('new-list', CARD);
  });

  it('disables toggles in a read-only share view', () => {
    state.canEdit = false;
    createListPicker().show(CARD);

    expect(document.querySelector('.list-picker-new-toggle')).toBeNull();
    for (const row of document.querySelectorAll('.list-picker-row')) {
      expect(row.disabled).toBe(true);
    }
  });
});
