import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearSelection,
  getSelectedCards,
  getSelectedCount,
  isCardSelected,
  isSelectionMode,
  onSelectionChange,
  setSelectionMode,
  toggleSelection,
} from '../selectionState.js';

const card = (id, name) => ({ id, name });

beforeEach(() => {
  setSelectionMode(false);
  clearSelection();
});

describe('selectionState', () => {
  it('starts inactive and empty', () => {
    expect(isSelectionMode()).toBe(false);
    expect(getSelectedCount()).toBe(0);
    expect(getSelectedCards()).toEqual([]);
  });

  it('toggles cards by name and reports selection', () => {
    const alpha = card('a-print', 'Alpha');

    toggleSelection(alpha);
    expect(isCardSelected(card('other-print', 'Alpha'))).toBe(true);
    expect(getSelectedCards()).toEqual([alpha]);

    toggleSelection(alpha);
    expect(getSelectedCount()).toBe(0);
    expect(isCardSelected(alpha)).toBe(false);
  });

  it('keys selections by card name, not printing', () => {
    toggleSelection(card('a1', 'Alpha'));
    expect(isCardSelected(card('a2', 'Alpha'))).toBe(true);

    // A second printing of the same name toggles that one entry off.
    toggleSelection(card('a2', 'Alpha'));
    expect(getSelectedCount()).toBe(0);
  });

  it('clears the selection when leaving selection mode', () => {
    setSelectionMode(true);
    toggleSelection(card('a', 'Alpha'));

    setSelectionMode(false);
    expect(isSelectionMode()).toBe(false);
    expect(getSelectedCount()).toBe(0);
  });

  it('notifies listeners on changes and stops after unsubscribe', () => {
    const listener = vi.fn();
    const off = onSelectionChange(listener);

    setSelectionMode(true);
    toggleSelection(card('a', 'Alpha'));
    clearSelection();
    expect(listener).toHaveBeenCalledTimes(3);

    off();
    setSelectionMode(false);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
