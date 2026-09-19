import { primaryName } from './cardStore.js';

/**
 * Multi-select state for bulk editing. Selections are keyed by card name so a
 * tile's displayed printing and any re-render still count as the same card.
 */
const selected = new Map();
let active = false;

/** Subscribers notified whenever the mode or the selection changes. */
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

/** True while the grid is in bulk-select mode. */
export function isSelectionMode() {
  return active;
}

/** The cards currently selected, in insertion order. */
export function getSelectedCards() {
  return [...selected.values()];
}

export function getSelectedCount() {
  return selected.size;
}

/** True when the given card's name is selected. */
export function isCardSelected(card) {
  return selected.has(primaryName(card));
}

/** Subscribe to selection changes. Returns an unsubscribe function. */
export function onSelectionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Enter or leave bulk-select mode. Leaving clears the selection, so a later
 * mode entry starts fresh.
 */
export function setSelectionMode(next) {
  if (active === next) return;
  active = next;
  if (!active) selected.clear();
  notify();
}

/** Add or remove one card from the selection. */
export function toggleSelection(card) {
  const name = primaryName(card);
  if (selected.has(name)) selected.delete(name);
  else selected.set(name, card);
  notify();
}

/** Replace the whole selection with `cards` (one entry per card name). */
export function setSelection(cards) {
  selected.clear();
  for (const card of cards) selected.set(primaryName(card), card);
  notify();
}

export function clearSelection() {
  if (selected.size === 0) return;
  selected.clear();
  notify();
}
