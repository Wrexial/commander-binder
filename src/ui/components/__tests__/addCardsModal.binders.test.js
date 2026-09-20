import { describe, it, expect, vi, beforeEach } from 'vitest';

const cards = vi.hoisted(() => [
  { id: 'a', name: 'Alpha', set: 'tst', collector_number: '1' },
  { id: 'b', name: 'Beta', set: 'tst', collector_number: '2' },
]);
const binders = vi.hoisted(() => ({ list: [], added: [] }));

vi.mock('../../../state/cardStore.js', () => ({
  cardStore: {
    getAll: vi.fn(() => cards),
    getPrintings: vi.fn((name) => cards.filter((card) => card.name === name)),
    getByPrintingId: vi.fn((id) => cards.find((card) => card.id === id) || null),
  },
  primaryName: (cardOrName) =>
    (typeof cardOrName === 'string' ? cardOrName : cardOrName?.name || '').split(' // ')[0],
}));

vi.mock('../../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  setCardsOwned: vi.fn(async () => {}),
}));

vi.mock('../../../state/wishlistState.js', () => ({
  isCardWanted: vi.fn(() => false),
  setCardsWanted: vi.fn(async () => {}),
}));

vi.mock('../../../state/listsState.js', () => ({
  getLists: vi.fn(() => []),
  getList: vi.fn(() => null),
  isInList: vi.fn(() => false),
  addCardsToList: vi.fn(async () => {}),
  createList: vi.fn(async () => null),
}));

vi.mock('../../../state/bindersState.js', () => ({
  getBinders: vi.fn(() => binders.list),
  getBinder: vi.fn((id) => binders.list.find((binder) => binder.id === id) || null),
  getActiveBinder: vi.fn(() => null),
  isCardInBinder: vi.fn(() => false),
  createBinder: vi.fn(async ({ name }) => {
    const binder = { id: `B${binders.list.length + 1}`, name, slots: {} };
    binders.list.push(binder);
    return binder;
  }),
  addCardsToBinder: vi.fn(async (id, batch) => {
    binders.added.push({ id, cards: batch });
  }),
}));

vi.mock('../../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { createAddCardsModal } from '../addCardsModal.js';
import { addCardsToBinder, isCardInBinder } from '../../../state/bindersState.js';

const targetButton = (label) =>
  [...document.querySelectorAll('.target-toggle-option')].find(
    (button) => button.textContent === label
  );

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  binders.list = [{ id: 'B1', name: 'Trade binder', slots: {} }];
  binders.added = [];
  isCardInBinder.mockReturnValue(false);
});

describe('addCardsModal binder targets', () => {
  it('defaults the target to the binder it is opened with', () => {
    createAddCardsModal({ kind: 'binder:B1' }).show();

    expect(document.querySelector('.bulk-modal-header h2').textContent).toBe(
      'Add to “Trade binder”'
    );
  });

  it('surfaces binders in the target picker', () => {
    createAddCardsModal().show();

    const labels = [...document.querySelectorAll('.target-toggle-option')].map(
      (button) => button.textContent
    );
    expect(labels).toEqual([
      'Collection',
      'Wishlist',
      'Binder: Trade binder',
      '+ New list',
      '+ New binder',
    ]);
  });

  it('creates a new binder from the picker and targets it', async () => {
    createAddCardsModal().show();

    document.querySelector('[data-action="new-binder"]').click();
    const input = document.querySelector('.target-new-binder-form input');
    expect(input).not.toBeNull();
    input.value = 'Fresh binder';
    document
      .querySelector('.target-new-binder-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() =>
      expect(document.querySelector('.bulk-modal-header h2').textContent).toBe(
        'Add to “Fresh binder”'
      )
    );
    const labels = [...document.querySelectorAll('.target-toggle-option')].map(
      (button) => button.textContent
    );
    expect(labels).toEqual([
      'Collection',
      'Wishlist',
      'Binder: Trade binder',
      'Binder: Fresh binder',
      '+ New list',
      '+ New binder',
    ]);
  });

  it('adds typed cards to the chosen binder', async () => {
    createAddCardsModal().show();

    targetButton('Binder: Trade binder').click();
    expect(document.querySelector('.bulk-modal-header h2').textContent).toBe(
      'Add to “Trade binder”'
    );

    const textarea = document.querySelector('.bulk-input-wrapper textarea');
    textarea.value = 'Alpha';
    textarea.dispatchEvent(new Event('input'));

    const primary = document.querySelector('.modal-button-container .primary');
    await vi.waitFor(() => expect(primary.disabled).toBe(false));
    primary.click();

    await vi.waitFor(() => expect(addCardsToBinder).toHaveBeenCalledTimes(1));
    expect(addCardsToBinder).toHaveBeenCalledWith('B1', [expect.objectContaining({ id: 'a' })]);
  });

  it('labels already-present binder cards', async () => {
    isCardInBinder.mockReturnValue(true);
    createAddCardsModal().show();

    targetButton('Binder: Trade binder').click();
    const textarea = document.querySelector('.bulk-input-wrapper textarea');
    textarea.value = 'Alpha';
    textarea.dispatchEvent(new Event('input'));

    await vi.waitFor(() =>
      expect(document.querySelector('.bulk-summary')?.textContent).toContain(
        'Already in “Trade binder”'
      )
    );
  });
});
