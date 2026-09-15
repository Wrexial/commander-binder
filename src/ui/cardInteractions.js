// src/ui/cardInteractions.js
import { showTooltip, isTooltipGestureActive } from './tooltip.js';
import { cardSettings } from '../state/cardSettings.js';
import { appState } from '../state/appState.js';
import { isCardOwned, toggleCardOwned, setCardsOwned } from '../state/cardState.js';
import { showUndo, showToast } from './components/toast.js';
import { updateOwnedCounter } from './components/ownedCounter.js';
import { adjustBinderOwnedCount } from './layout.js';
import { cardStore } from '../state/cardStore.js';
import { preloadCardImages } from '../utils/cardImages.js';
import { nextPrinting } from '../utils/printings.js';
import { refreshCardElement, syncCardOwnedUi } from './cards.js';

// Use a WeakMap to associate state with an element without memory leaks or polluting the DOM
const elementState = new WeakMap();

function getState(el) {
  if (!elementState.has(el)) {
    elementState.set(el, {});
  }
  return elementState.get(el);
}

// --- Delegated Event Handlers ---

// The card tooltip is touch-only: on PC the tile footer carries the name, set,
// price and status, so hover previews were removed. Touch has no hover phase,
// so a long-press opens the tooltip (and its "Next printing" button).

let touchTimer;
let touchStartX, touchStartY;
// True between touchstart and touchend: some browsers fire `contextmenu` partway
// through a long press, and that must not also cycle the printing.
let touchSequenceActive = false;

function handleTouchStart(event, tooltip) {
  const cardElement = event.target.closest('.card');
  if (!cardElement) return;

  touchSequenceActive = true;
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;

  const state = getState(cardElement);
  state.isLongPress = false;

  // The tooltip owns the cycle action on touch (no right-click), so use the
  // default touch wording rather than any label left by the statistics modal.
  tooltip.onCycle = appState.isViewOnlyMode
    ? null
    : (cycleEvent) => cycleCardPrinting(cardElement, cycleEvent, tooltip);
  tooltip.cycleLabel = null;

  // Touch has no hover phase; start the image early since the tooltip shows
  // only after a 500ms long-press.
  if (cardSettings.showTooltip) {
    preloadCardImages(cardElement.cardData);
  }

  touchTimer = setTimeout(() => {
    state.isLongPress = true;
    showTooltip(event.touches[0], cardElement.cardData, tooltip);
    if (navigator.vibrate) navigator.vibrate(10);
  }, 500);
}

function handleTouchMove(event) {
  const touch = event.touches[0];
  const dx = Math.abs(touch.clientX - touchStartX);
  const dy = Math.abs(touch.clientY - touchStartY);
  if (dx > 10 || dy > 10) {
    clearTimeout(touchTimer);
  }
}

function handleTouchEnd(event) {
  clearTimeout(touchTimer);
  touchSequenceActive = false;

  const cardElement = event.target.closest('.card');
  if (!cardElement) return;

  const state = getState(cardElement);
  if (state.isLongPress) {
    state.suppressUntil = Date.now() + 100;
    state.isLongPress = false;
    // preventDefault might not be enough to stop the simulated click
  }
}

async function handleContainerClick(event) {
  const cardElement = event.target.closest('.card');
  // Ignore clicks if they aren't on a card, are on the EDHREC link, or in view-only mode
  if (!cardElement || event.target.closest('.edhrec-link') || appState.isViewOnlyMode) {
    return;
  }

  // A tap that opened or dismissed the full-screen preview must not also mark
  // the card owned — one tap, one action.
  if (isTooltipGestureActive()) return;

  const card = cardElement.cardData;
  if (!card) return;

  // Suppress clicks after a long-press (logic can be expanded here)
  const state = getState(cardElement);
  if (state.suppressUntil && Date.now() < state.suppressUntil) return;

  const wasMissing = !isCardOwned(card);
  event.stopPropagation();

  let isOwned;
  try {
    isOwned = await toggleCardOwned(card);
  } catch (err) {
    console.error('Failed to update card ownership:', err);
    showToast('Could not update the card. Please try again.', 'error');
    return;
  }

  syncCardOwnedUi(cardElement, isOwned);

  updateOwnedCounter(); // Update global counter
  adjustBinderOwnedCount(cardElement.closest('.binder'), isOwned ? 1 : -1);

  // Undo logic
  showUndo(isOwned ? 'Marked as owned' : 'Marked as missing', async () => {
    try {
      await setCardsOwned([card], !wasMissing);
    } catch (err) {
      console.error('Failed to undo card change:', err);
      showToast('Could not undo the change.', 'error');
      return;
    }
    syncCardOwnedUi(cardElement, !wasMissing);
    updateOwnedCounter();
    adjustBinderOwnedCount(cardElement.closest('.binder'), wasMissing ? -1 : 1);
  });
}

/**
 * Advance a tile to its next printing and refresh it. Desktop right-click and
 * the tooltip's "Next printing" button (touch) both route through here.
 */
function cycleCardPrinting(cardElement, event, tooltip) {
  if (!cardElement || !cardElement.cardData || appState.isViewOnlyMode) return;

  const next = nextPrinting(
    cardStore.getPrintings(cardElement.cardData.name),
    cardElement.cardData
  );
  if (!next) return;

  cardElement.cardData = next;

  // Keep the tile in sync with the newly displayed printing (matters in image
  // mode, where the artwork, price and version badge differ per printing).
  refreshCardElement(cardElement);

  // Only refresh the tooltip when it is actually open (touch long-press).
  // `showTooltip` sets display to 'flex'; it starts empty and 'none' when
  // hidden, so check for the open value explicitly.
  if (tooltip && tooltip.style.display === 'flex') {
    showTooltip(event, next, tooltip);
  }
}

function handleContextMenu(event, tooltip) {
  const cardElement = event.target.closest('.card');
  if (!cardElement) return;

  event.preventDefault();

  // A long press already belongs to the preview: on touch, the browser's
  // contextmenu fires mid-press, and on a phone the dialog is either opening or
  // already open. One gesture, one action.
  if (touchSequenceActive || isTooltipGestureActive()) return;

  cycleCardPrinting(cardElement, event, tooltip);
}

// --- Main Initialization ---

export function initCardInteractions(container, tooltip) {
  container.addEventListener('click', handleContainerClick);
  container.addEventListener('contextmenu', (e) => handleContextMenu(e, tooltip));

  container.addEventListener('touchstart', (e) => handleTouchStart(e, tooltip), { passive: true });
  container.addEventListener('touchmove', handleTouchMove, { passive: true });
  container.addEventListener('touchend', handleTouchEnd);
  // A cancelled touch (system gesture, incoming call) must still clear the flag
  // above and drop the pending long-press.
  container.addEventListener('touchcancel', handleTouchEnd);
}
