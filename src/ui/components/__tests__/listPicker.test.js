import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({ lists: [], members: new Set(), canEdit: true }));

vi.mock('../../../state/listsState.js', () => ({
  canEditLists: vi.fn(() => state.canEdit),
  getLists: vi.fn(() => state.lists),
  isInList: vi.fn((id, card) => state.members.has(`${id}:${card.id}`)),
  createList: vi.fn(async ({ name }) => ({ id: 'new-list', name })),
  addCardsToList: vi.fn(async (id, cards) => {
    for (const card of cards) state.members.add(`${id}:${card.id}`);
  }),
  toggleCardsInList: vi.fn(async (id, cards) => {
    const all = cards.every((card) => state.members.has(`${id}:${card.id}`));
    for (const card of cards) {
      if (all) state.members.delete(`${id}:${card.id}`);
      else state.members.add(`${id}:${card.id}`);
    }
    return !all;
  }),
}));

vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));

import { createListPicker } from '../listPicker.js';
import { analyzeA11y } from '../../../__tests__/helpers/a11y.js';
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
  it('lists every list and toggles membership for the batch', async () => {
    createListPicker().show(CARD);

    const rows = [...document.querySelectorAll('.list-picker-row')];
    expect(rows.map((row) => row.querySelector('.list-picker-name').textContent)).toEqual([
      'Trade pile',
      'Deck: Atraxa',
    ]);

    rows[0].click();
    await vi.waitFor(() => expect(listsState.toggleCardsInList).toHaveBeenCalledWith('L1', [CARD]));
    expect(updateAllCardStates).toHaveBeenCalled();
  });

  it('toggles a whole selection and marks partial membership', async () => {
    state.members = new Set(['L1:p1']);
    createListPicker().show([CARD, { id: 'p2', name: 'Sol Ring' }]);

    expect(document.querySelector('.list-picker-row.is-partial')).not.toBeNull();
    expect(document.querySelector('.list-picker-row.is-member')).toBeNull();

    document.querySelector('.list-picker-row').click();
    await vi.waitFor(() => expect(listsState.toggleCardsInList).toHaveBeenCalled());
    expect(listsState.toggleCardsInList.mock.calls[0][1]).toHaveLength(2);
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
    expect(listsState.addCardsToList).toHaveBeenCalledWith('new-list', [CARD]);
  });

  it('disables toggles in a read-only share view', () => {
    state.canEdit = false;
    createListPicker().show(CARD);

    expect(document.querySelector('.list-picker-new-toggle')).toBeNull();
    for (const row of document.querySelectorAll('.list-picker-row')) {
      expect(row.disabled).toBe(true);
    }
  });

  it('has no accessibility violations', async () => {
    createListPicker().show(CARD);
    const { violations, summary } = await analyzeA11y(document.body);
    expect(violations.length, summary).toBe(0);
  });
});
