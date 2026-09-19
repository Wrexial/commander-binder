import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

vi.mock('../../state/cardState.js', () => ({
  setCardsOwned: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../state/wishlistState.js', () => ({
  setCardsWanted: vi.fn(() => Promise.resolve()),
}));
vi.mock('../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../layout.js', () => ({ updateAllBinderCounts: vi.fn() }));
vi.mock('../components/ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../components/toast.js', () => ({ showToast: vi.fn() }));

import { initBulkEdit, toggleSelectionMode } from '../bulkEdit.js';
import { setCardsOwned } from '../../state/cardState.js';
import { setCardsWanted } from '../../state/wishlistState.js';
import { setSelectionMode, toggleSelection } from '../../state/selectionState.js';
import { showToast } from '../components/toast.js';

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
  it('offers an always-visible Select toggle that hides while selecting', () => {
    const toggle = document.getElementById('select-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle.hidden).toBe(false);

    toggle.click();
    expect(document.body.classList.contains('selection-mode')).toBe(true);
    expect(toggle.hidden).toBe(true);

    action('done').click();
    expect(toggle.hidden).toBe(false);
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
    expect(showToast).toHaveBeenCalledWith('1 card updated.', 'success');
  });

  it('adds the selection to the wishlist', async () => {
    toggleSelectionMode();
    toggleSelection({ id: 'w', name: 'Wanted' });

    action('want').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(setCardsWanted).toHaveBeenCalledWith([{ id: 'w', name: 'Wanted' }], true);
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
});
