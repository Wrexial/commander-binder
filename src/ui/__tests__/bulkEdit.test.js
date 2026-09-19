import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  setCardsOwned: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../state/wishlistState.js', () => ({
  isCardWanted: vi.fn(() => false),
  setCardsWanted: vi.fn(() => Promise.resolve()),
}));
vi.mock('../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../components/ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../components/toast.js', () => ({ showToast: vi.fn(), showUndo: vi.fn() }));
vi.mock('../components/listPicker.js', () => ({ showListPicker: vi.fn() }));

import { initBulkEdit, toggleSelectionMode } from '../bulkEdit.js';
import { updateAllCardStates } from '../cards.js';
import { isCardOwned, setCardsOwned } from '../../state/cardState.js';
import { setCardsWanted } from '../../state/wishlistState.js';
import {
  getSelectedCount,
  isSelectionMode,
  setSelectionMode,
  toggleSelection,
} from '../../state/selectionState.js';
import { showToast, showUndo } from '../components/toast.js';
import { showListPicker } from '../components/listPicker.js';

const bar = () => document.querySelector('.bulk-edit-bar');
const action = (name) => document.querySelector(`button[data-action="${name}"]`);

beforeAll(() => {
  initBulkEdit();
});

afterAll(() => {
  setSelectionMode(false);
  document.body.innerHTML = '';
});

beforeEach(() => {
  vi.clearAllMocks();
  setSelectionMode(false);
  setCardsOwned.mockResolvedValue();
  setCardsWanted.mockResolvedValue();
});

describe('bulkEdit', () => {
  it('keeps the bar hidden until selection mode is entered', () => {
    expect(bar().hidden).toBe(true);
    expect(document.body.classList.contains('selection-mode')).toBe(false);

    toggleSelectionMode();
    expect(bar().hidden).toBe(false);

    setSelectionMode(false);
    expect(bar().hidden).toBe(true);
  });

  it('shows the bar and live count in selection mode', () => {
    toggleSelectionMode();

    expect(document.body.classList.contains('selection-mode')).toBe(true);
    expect(bar().hidden).toBe(false);

    toggleSelection({ id: 'a', name: 'Alpha' });
    expect(document.querySelector('.bulk-edit-count').textContent).toBe('1 selected');
  });

  it('marks the selection owned and refreshes the chrome', async () => {
    toggleSelectionMode();
    toggleSelection({ id: 'a', name: 'Alpha' });

    action('owned').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(setCardsOwned).toHaveBeenCalledWith([{ id: 'a', name: 'Alpha' }], true);
    expect(showUndo).toHaveBeenCalledWith('1 card updated', expect.any(Function));
  });

  it('adds the selection to the wishlist', async () => {
    toggleSelectionMode();
    toggleSelection({ id: 'w', name: 'Wanted' });

    action('want').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(setCardsWanted).toHaveBeenCalledWith([{ id: 'w', name: 'Wanted' }], true);
  });

  it('opens the list picker for the whole selection', () => {
    toggleSelectionMode();
    toggleSelection({ id: 'a', name: 'Alpha' });
    toggleSelection({ id: 'b', name: 'Beta' });

    action('list').click();

    expect(showListPicker).toHaveBeenCalledWith([
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ]);
  });

  it('does not open the list picker for an empty selection', () => {
    toggleSelectionMode();

    action('list').click();

    expect(showToast).toHaveBeenCalledWith('Select at least one card first.', 'warning');
    expect(showListPicker).not.toHaveBeenCalled();
  });

  it('warns instead of calling the server when nothing is selected', () => {
    toggleSelectionMode();

    action('owned').click();

    expect(showToast).toHaveBeenCalledWith('Select at least one card first.', 'warning');
    expect(setCardsOwned).not.toHaveBeenCalled();
  });

  it('leaves selection mode from Done', () => {
    toggleSelectionMode();

    action('done').click();

    expect(document.body.classList.contains('selection-mode')).toBe(false);
    expect(bar().hidden).toBe(true);
  });

  it('repaints the tile outlines when Clear empties the selection', () => {
    toggleSelectionMode();
    toggleSelection({ id: 'a', name: 'Alpha' });
    updateAllCardStates.mockClear();

    action('clear').click();

    expect(updateAllCardStates).toHaveBeenCalled();
    expect(document.querySelector('.bulk-edit-count').textContent).toBe('0 selected');
  });

  it('repaints the tile outlines when Done leaves the mode', () => {
    toggleSelectionMode();
    toggleSelection({ id: 'a', name: 'Alpha' });
    updateAllCardStates.mockClear();

    action('done').click();

    expect(updateAllCardStates).toHaveBeenCalled();
  });

  /** Build a #results grid of tiles; hidden tiles get display:none. */
  function withResults(tiles) {
    const results = document.createElement('div');
    results.id = 'results';
    for (const { id, hidden } of tiles) {
      const element = document.createElement('div');
      element.className = 'card';
      element.cardData = { id, name: `Card ${id}` };
      if (hidden) element.style.display = 'none';
      results.appendChild(element);
    }
    document.body.appendChild(results);
    return results;
  }

  it('selects every visible tile from Select all', () => {
    const results = withResults([{ id: 'a' }, { id: 'b' }, { id: 'c', hidden: true }]);

    toggleSelectionMode();
    action('all').click();

    expect(getSelectedCount()).toBe(2);
    results.remove();
    setSelectionMode(false);
  });

  it('drops hidden cards from the selection when the filter changes', () => {
    const results = withResults([{ id: 'a' }, { id: 'b' }]);

    toggleSelectionMode();
    toggleSelection({ id: 'a', name: 'Card a' });
    toggleSelection({ id: 'b', name: 'Card b' });
    expect(getSelectedCount()).toBe(2);

    results.querySelectorAll('.card')[1].style.display = 'none';
    document.dispatchEvent(new CustomEvent('cards:filtered'));

    expect(getSelectedCount()).toBe(1);
    results.remove();
    setSelectionMode(false);
  });

  it('offers an undo that restores the previous ownership', async () => {
    toggleSelectionMode();
    toggleSelection({ id: 'a', name: 'Alpha' });
    isCardOwned.mockReturnValue(false); // was missing before the action

    action('owned').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(setCardsOwned).toHaveBeenCalledWith([{ id: 'a', name: 'Alpha' }], true);

    const undo = showUndo.mock.calls.at(-1)[1];
    setCardsOwned.mockClear();
    await undo();

    expect(setCardsOwned).toHaveBeenCalledWith([{ id: 'a', name: 'Alpha' }], false);
  });

  it('leaves selection mode on Escape', () => {
    toggleSelectionMode();
    expect(isSelectionMode()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(isSelectionMode()).toBe(false);
  });
});
