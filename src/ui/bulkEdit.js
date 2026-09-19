import { setCardsOwned } from '../state/cardState.js';
import { setCardsWanted } from '../state/wishlistState.js';
import {
  clearSelection,
  getSelectedCards,
  getSelectedCount,
  isSelectionMode,
  onSelectionChange,
  setSelectionMode,
} from '../state/selectionState.js';
import { updateAllCardStates } from './cards.js';
import { updateAllBinderCounts } from './layout.js';
import { updateOwnedCounter } from './components/ownedCounter.js';
import { showToast } from './components/toast.js';

let bar = null;
let countEl = null;
let initialized = false;

/** Build the floating action bar once and wire its buttons. */
function buildBar() {
  if (bar) return bar;

  bar = document.createElement('div');
  bar.className = 'bulk-edit-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <span class="bulk-edit-count" aria-live="polite"></span>
    <div class="bulk-edit-actions">
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

async function handleAction(action) {
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

  try {
    if (action === 'owned') await setCardsOwned(cards, true);
    else if (action === 'missing') await setCardsOwned(cards, false);
    else if (action === 'want') await setCardsWanted(cards, true);
    else if (action === 'unwant') await setCardsWanted(cards, false);
    else return;
  } catch (err) {
    console.error('Bulk edit failed:', err);
    showToast('Could not update the selected cards.', 'error');
    return;
  }

  // Marks are stored, so re-sync the tiles. Only the owned actions move the
  // binder/owned counters; the wishlist has no counter of its own.
  updateAllCardStates();
  if (action === 'owned' || action === 'missing') {
    updateAllBinderCounts();
    updateOwnedCounter();
  }
  showToast(`${cards.length} card${cards.length === 1 ? '' : 's'} updated.`, 'success');
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
  sync();
}

/** Toggle bulk-select mode. Creates the bar on first use. */
export function toggleSelectionMode() {
  initBulkEdit();
  setSelectionMode(!isSelectionMode());
  // Re-render the mounted tiles so their selection outlines follow the mode.
  updateAllCardStates();
}
