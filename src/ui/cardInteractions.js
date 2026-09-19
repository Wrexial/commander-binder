// src/ui/cardInteractions.js
import { showTooltip, showTooltipCard, isTooltipGestureActive } from './tooltip.js';
import { appState } from '../state/appState.js';
import { isCardOwned, toggleCardOwned, setCardsOwned } from '../state/cardState.js';
import { showUndo, showToast } from './components/toast.js';
import { updateOwnedCounter } from './components/ownedCounter.js';
import { adjustBinderOwnedCount } from './layout.js';
import { cardStore } from '../state/cardStore.js';
import { preloadCardImages } from '../utils/cardImages.js';
import { nextPrinting } from '../utils/printings.js';
import { isHoverCapable } from '../utils/pointer.js';
import { refreshCardElement, syncCardOwnedUi } from './cards.js';

// Use a WeakMap to associate state with an element without memory leaks or polluting the DOM
const elementState = new WeakMap();

function getState(el) {
  if (!elementState.has(el)) {
    elementState.set(el, {});
  }
  return elementState.get(el);
}

/** Card currently shown in the full-screen preview, for swipe navigation. */
let tooltipCardElement = null;

/** True when a card (or an ancestor) is hidden by the active search/filter. */
function isHiddenByFilter(element) {
  for (let node = element; node; node = node.parentElement) {
    if (node.hidden || node.style?.display === 'none') return true;
  }
  return false;
}

/**
 * The neighbouring card in the on-screen order, skipping cards hidden by the
 * active search/filter. `direction` is +1 for next, -1 for previous.
 */
function findAdjacentCard(current, direction) {
  if (!current) return null;

  const cards = Array.from(document.querySelectorAll('.card')).filter(
    (card) => !isHiddenByFilter(card)
  );
  const index = cards.indexOf(current);
  return index === -1 ? null : cards[index + direction] || null;
}

/** Move the open preview to the adjacent card, so its controls follow it. */
function navigateTooltip(direction, event, tooltip) {
  const target = findAdjacentCard(tooltipCardElement, direction);
  if (!target || !target.cardData) return;

  tooltipCardElement = target;
  tooltip.onCycle = (cycleEvent) => cycleCardPrinting(target, cycleEvent, tooltip);
  tooltip.cycleLabel = null;
  preloadCardImages(target.cardData);
  showTooltipCard(target.cardData, tooltip, event);
}

/**
 * Open the modal preview for a tile, wiring its printing-cycle and
 * swipe-navigation controls. Used by desktop clicks and "Surprise me".
 */
function openPreview(cardElement, card, tooltip, event) {
  tooltipCardElement = cardElement;
  tooltip.onCycle = (cycleEvent) => cycleCardPrinting(cardElement, cycleEvent, tooltip);
  tooltip.onNavigate = (direction, navEvent) => navigateTooltip(direction, navEvent, tooltip);
  tooltip.cycleLabel = null;
  preloadCardImages(card);
  showTooltip(event, card, tooltip, { modal: true });
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

  // The tooltip owns the cycle action on touch (no right-click). This stays
  // available in view-only/guest mode too: looking at another printing is a
  // view action, not an edit.
  tooltip.onCycle = (cycleEvent) => cycleCardPrinting(cardElement, cycleEvent, tooltip);
  tooltip.cycleLabel = null;

  // Swiping the full-screen preview left/right walks the visible grid.
  tooltipCardElement = cardElement;
  tooltip.onNavigate = (direction, navEvent) => navigateTooltip(direction, navEvent, tooltip);

  // Touch has no hover phase; start the image early since the preview shows
  // only after a 500ms long-press.
  preloadCardImages(cardElement.cardData);

  touchTimer = setTimeout(() => {
    state.isLongPress = true;
    showTooltip(event.touches[0], cardElement.cardData, tooltip, { modal: true });
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

async function handleContainerClick(event, tooltip) {
  const cardElement = event.target.closest('.card');
  if (!cardElement) return;

  // The printing-count badge is its own control: it cycles the printing (the
  // keyboard path is Enter/Space on the button) and must never fall through to
  // the ownership toggle below.
  if (event.target.closest('.card-versions')) {
    event.stopPropagation();
    cycleCardPrinting(cardElement, event, tooltip);
    return;
  }

  // Ignore clicks on the EDHREC link.
  if (event.target.closest('.edhrec-link')) return;

  // A tap that opened or dismissed the preview must not also do anything else —
  // one tap, one action.
  if (isTooltipGestureActive()) return;

  const card = cardElement.cardData;
  if (!card) return;

  // Suppress clicks after a long-press (logic can be expanded here)
  const state = getState(cardElement);
  if (state.suppressUntil && Date.now() < state.suppressUntil) return;

  // The ownership control is its own button. On a pointer device, clicking
  // anywhere else opens the modal preview; on touch a tap still toggles, since
  // the long-press is the preview there.
  const onToggle = Boolean(event.target.closest('.card-toggle'));
  if (!onToggle && isHoverCapable()) {
    event.stopPropagation();
    openPreview(cardElement, card, tooltip, event);
    return;
  }

  if (appState.isViewOnlyMode) return;

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
  if (!cardElement || !cardElement.cardData) return;

  const next = nextPrinting(
    cardStore.getPrintings(cardElement.cardData.name),
    cardElement.cardData
  );
  if (!next) return;

  // Cycling rebuilds the tile, which would drop focus on the (replaced) version
  // button; put it back so keyboard users stay on the control they activated.
  const restoreFocus = document.activeElement?.classList.contains('card-versions');

  cardElement.cardData = next;

  // Keep the tile in sync with the newly displayed printing (matters in image
  // mode, where the artwork, price and version badge differ per printing).
  refreshCardElement(cardElement);
  if (restoreFocus) cardElement.querySelector('.card-versions')?.focus();

  // Only refresh the tooltip when it is actually open (touch long-press).
  // `showTooltip` sets display to 'flex'; it starts empty and 'none' when
  // hidden, so check for the open value explicitly.
  if (tooltip && tooltip.style.display === 'flex') {
    showTooltip(event, next, tooltip, { modal: true });
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

/** The active `card:preview` listener (replaced on re-init, never stacked). */
let previewHandler = null;

export function initCardInteractions(container, tooltip) {
  container.addEventListener('click', (event) => handleContainerClick(event, tooltip));
  container.addEventListener('contextmenu', (e) => handleContextMenu(e, tooltip));

  container.addEventListener('touchstart', (e) => handleTouchStart(e, tooltip), { passive: true });
  container.addEventListener('touchmove', handleTouchMove, { passive: true });
  container.addEventListener('touchend', handleTouchEnd);
  // A cancelled touch (system gesture, incoming call) must still clear the flag
  // above and drop the pending long-press.
  container.addEventListener('touchcancel', handleTouchEnd);

  // `randomCard.js` asks for a preview without importing this module (which
  // would create an import cycle).
  if (previewHandler) document.removeEventListener('card:preview', previewHandler);
  previewHandler = (event) => {
    const { element, card } = event.detail || {};
    if (element && card) openPreview(element, card, tooltip, { clientX: 0, clientY: 0 });
  };
  document.addEventListener('card:preview', previewHandler);
}
