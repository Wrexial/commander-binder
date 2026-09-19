import { isCardOwned, setCardsOwned } from '../state/cardState.js';
import { isCardWanted, setCardsWanted } from '../state/wishlistState.js';
import {
  clearSelection,
  getSelectedCards,
  getSelectedCount,
  isSelectionMode,
  onSelectionChange,
  setSelection,
  setSelectionMode,
} from '../state/selectionState.js';
import { primaryName } from '../state/cardStore.js';
import { updateAllCardStates } from './cards.js';
import { updateAllBinderCounts } from './layout.js';
import { updateOwnedCounter } from './components/ownedCounter.js';
import { showToast, showUndo } from './components/toast.js';

let bar = null;
let countEl = null;
let initialized = false;

/** True when a card tile (or an ancestor) is hidden by the active filter. */
function isElementVisible(element) {
  for (let node = element; node; node = node.parentElement) {
    if (node.hidden || node.style?.display === 'none') return false;
  }
  return true;
}

/** The mounted tiles the active search/filter currently shows. */
function visibleCards() {
  return Array.from(document.querySelectorAll('#results .card')).filter(
    (element) => element.cardData && isElementVisible(element)
  );
}

/** Build the floating action bar once and wire its buttons. */
function buildBar() {
  if (bar) return bar;

  bar = document.createElement('div');
  bar.className = 'bulk-edit-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <span class="bulk-edit-label">Selecting</span>
    <span class="bulk-edit-count" aria-live="polite"></span>
    <div class="bulk-edit-actions">
      <button type="button" data-action="all">Select all</button>
      <button type="button" data-action="owned">Mark owned</button>
      <button type="button" data-action="missing">Mark missing</button>
      <button type="button" data-action="want">Want</button>
      <button type="button" data-action="unwant">Unwant</button>
      <button type="button" data-action="clear">Clear</button>
      <button type="button" data-action="done" class="primary">Done</button>
    </div>`;
  countEl = bar.querySelector('.bulk-edit-count');
  bar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) handleAction(button.dataset.action);
  });
  document.body.appendChild(bar);
  return bar;
}

/** Select every tile the active filter is showing. */
function selectAllVisible() {
  const cards = visibleCards().map((element) => element.cardData);
  if (cards.length === 0) {
    showToast('No visible cards to select.', 'warning');
    return;
  }
  setSelection(cards);
  updateAllCardStates();
}

/**
 * Drop selected cards a filter has just hidden, so an action can never touch
 * cards the collector can't see.
 */
function pruneHiddenSelection() {
  if (!isSelectionMode()) return;

  const visibleNames = new Set(visibleCards().map((element) => primaryName(element.cardData)));
  const selected = getSelectedCards();
  const kept = selected.filter((card) => visibleNames.has(primaryName(card)));
  if (kept.length === selected.length) return;

  setSelection(kept);
  updateAllCardStates();
}

async function applyToSelection(action, cards) {
  if (action === 'owned') await setCardsOwned(cards, true);
  else if (action === 'missing') await setCardsOwned(cards, false);
  else if (action === 'want') await setCardsWanted(cards, true);
  else if (action === 'unwant') await setCardsWanted(cards, false);
}

/** Restore the pre-action state of the affected collection. */
async function undoSelection(action, before) {
  if (action === 'owned' || action === 'missing') {
    const owned = before.filter((entry) => entry.owned).map((entry) => entry.card);
    const missing = before.filter((entry) => !entry.owned).map((entry) => entry.card);
    if (owned.length > 0) await setCardsOwned(owned, true);
    if (missing.length > 0) await setCardsOwned(missing, false);
    return;
  }

  const wanted = before.filter((entry) => entry.wanted).map((entry) => entry.card);
  const unwanted = before.filter((entry) => !entry.wanted).map((entry) => entry.card);
  if (wanted.length > 0) await setCardsWanted(wanted, true);
  if (unwanted.length > 0) await setCardsWanted(unwanted, false);
}

async function handleAction(action) {
  if (action === 'all') {
    selectAllVisible();
    return;
  }
  if (action === 'clear') {
    clearSelection();
    // The selection map changed, so repaint the tiles' selection outlines.
    updateAllCardStates();
    return;
  }
  if (action === 'done') {
    setSelectionMode(false);
    updateAllCardStates();
    return;
  }

  const cards = getSelectedCards();
  if (cards.length === 0) {
    showToast('Select at least one card first.', 'warning');
    return;
  }

  // Snapshot before the change so the undo toast can restore each card exactly.
  const before = cards.map((card) => ({
    card,
    owned: isCardOwned(card),
    wanted: isCardWanted(card),
  }));

  try {
    await applyToSelection(action, cards);
  } catch (err) {
    console.error('Bulk edit failed:', err);
    showToast('Could not update the selected cards.', 'error');
    return;
  }

  updateAllCardStates();
  if (action === 'owned' || action === 'missing') {
    updateAllBinderCounts();
    updateOwnedCounter();
  }
  showUndo(`${cards.length} card${cards.length === 1 ? '' : 's'} updated`, async () => {
    try {
      await undoSelection(action, before);
    } catch (err) {
      console.error('Bulk edit undo failed:', err);
      showToast('Could not undo the change.', 'error');
      return;
    }
    updateAllCardStates();
    updateAllBinderCounts();
    updateOwnedCounter();
  });
}

/** Reflect the mode/count on the body class and the action bar. */
function sync() {
  const active = isSelectionMode();
  document.body.classList.toggle('selection-mode', active);
  if (!bar) return;
  bar.hidden = !active;
  countEl.textContent = `${getSelectedCount()} selected`;
}

/** Create the bar and start listening. Idempotent. */
export function initBulkEdit() {
  if (initialized) return;
  initialized = true;
  buildBar();
  onSelectionChange(sync);
  // A filter pass may hide selected tiles; keep the selection to what's visible.
  document.addEventListener('cards:filtered', pruneHiddenSelection);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isSelectionMode()) return;
    setSelectionMode(false);
    updateAllCardStates();
  });
  sync();
}

/** Toggle bulk-select mode. Creates the bar on first use. */
export function toggleSelectionMode() {
  initBulkEdit();
  setSelectionMode(!isSelectionMode());
  // Re-render the mounted tiles so their selection outlines follow the mode.
  updateAllCardStates();
}
