// src/ui/cardInteractions.js
import { showTooltip, showTooltipCard, isTooltipGestureActive } from './tooltip.js';
import { appState } from '../state/appState.js';
import { isCardOwned, toggleCardOwned, setCardsOwned } from '../state/cardState.js';
import { isCardWanted, toggleCardWanted, setCardsWanted } from '../state/wishlistState.js';
import { showUndo, showToast } from './components/toast.js';
import { updateOwnedCounter } from './components/ownedCounter.js';
import { adjustBinderOwnedCount } from './layout.js';
import { cardStore } from '../state/cardStore.js';
import { preloadCardImages } from '../utils/cardImages.js';
import { nextPrinting } from '../utils/printings.js';
import { rememberPreferredPrinting } from '../state/preferredPrintings.js';
import { isHoverCapable } from '../utils/pointer.js';
import { refreshCardElement, syncCardOwnedUi, syncCardWantedUi } from './cards.js';
import { showPressIndicator, hidePressIndicator } from './pressIndicator.js';

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

/**
 * Point the preview's controls (printing cycle, swipe navigation and ownership
 * toggle) at a card element. `onToggle` is null in view-only mode, so the modal
 * renders a plain status badge rather than a button.
 */
function wireCardControls(cardElement, tooltip) {
  tooltipCardElement = cardElement;
  tooltip.onCycle = (cycleEvent, direction) =>
    cycleCardPrinting(cardElement, cycleEvent, tooltip, direction);
  tooltip.onNavigate = (direction, navEvent) => navigateTooltip(direction, navEvent, tooltip);
  tooltip.onToggle = appState.isViewOnlyMode
    ? null
    : () => toggleCardOwnership(cardElement, cardElement.cardData);
  tooltip.onWishlistToggle = appState.isViewOnlyMode
    ? null
    : () => toggleWishlist(cardElement, cardElement.cardData);
  tooltip.cycleLabel = null;
}

/** Move the open preview to the adjacent card, so its controls follow it. */
function navigateTooltip(direction, event, tooltip) {
  const target = findAdjacentCard(tooltipCardElement, direction);
  if (!target || !target.cardData) return;

  wireCardControls(target, tooltip);
  preloadCardImages(target.cardData);
  showTooltipCard(target.cardData, tooltip, event);
}

/**
 * Open the modal preview for a tile, wiring its printing-cycle and
 * swipe-navigation controls. Used by desktop clicks and "Surprise me".
 */
function openPreview(cardElement, card, tooltip, event) {
  wireCardControls(cardElement, tooltip);
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

/** How long a press (touch or mouse) must be held to open the preview. */
const LONG_PRESS_MS = 500;
/** Movement (px) that cancels a pending mouse long-press. */
const LONG_PRESS_MOVE_TOLERANCE = 12;
/** How long after a mouse long-press its trailing click is swallowed. */
const LONG_PRESS_CLICK_GRACE_MS = 400;

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
  wireCardControls(cardElement, tooltip);

  // Touch has no hover phase; start the image early since the preview shows
  // only after a 500ms long-press.
  preloadCardImages(cardElement.cardData);

  touchTimer = setTimeout(() => {
    state.isLongPress = true;
    showTooltip(event.touches[0], cardElement.cardData, tooltip, { modal: true });
    if (navigator.vibrate) navigator.vibrate(10);
  }, LONG_PRESS_MS);
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

// --- Mouse long-press (desktop) ---
// A short click toggles ownership; holding the button opens the preview, with a
// filling ring under the cursor as feedback.
let mousePress = null;

function cancelMousePress() {
  if (!mousePress) return;
  clearTimeout(mousePress.timer);
  mousePress = null;
  hidePressIndicator();
}

function handleMouseDown(event, tooltip) {
  if (!isHoverCapable() || touchSequenceActive) return;
  if (event.button !== 0) return;

  const cardElement = event.target.closest('.card');
  if (!cardElement?.cardData) return;

  // Controls keep their own click behaviour.
  if (event.target.closest('button, a, .card-toggle, .card-versions, .edhrec-link')) return;

  cancelMousePress();

  const state = getState(cardElement);
  mousePress = {
    cardElement,
    state,
    startX: event.clientX,
    startY: event.clientY,
    timer: setTimeout(() => {
      const press = mousePress;
      mousePress = null;
      hidePressIndicator();
      if (!press) return;
      // Swallow the click that follows the release so it can't also toggle.
      press.state.suppressUntil = Date.now() + LONG_PRESS_CLICK_GRACE_MS;
      openPreview(press.cardElement, press.cardElement.cardData, tooltip, event);
    }, LONG_PRESS_MS),
  };

  showPressIndicator(event.clientX, event.clientY, LONG_PRESS_MS);
}

function handleMouseMove(event) {
  if (!mousePress) return;
  const dx = Math.abs(event.clientX - mousePress.startX);
  const dy = Math.abs(event.clientY - mousePress.startY);
  if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) {
    cancelMousePress();
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

  if (appState.isViewOnlyMode) return;

  event.stopPropagation();

  // The heart is its own control; a tap must not also toggle ownership.
  if (event.target.closest('.card-wishlist')) {
    await toggleWishlist(cardElement, card);
    return;
  }

  await toggleCardOwnership(cardElement, card);
}

/**
 * Add or remove a card from the wishlist, updating the tile and the undo toast.
 *
 * @param {HTMLElement} cardElement
 * @param {object} card
 * @returns {Promise<boolean|null>} the new wanted state, or null on failure.
 */
async function toggleWishlist(cardElement, card) {
  if (!cardElement || !card) return null;

  const wasWanted = !isCardWanted(card);

  let isWanted;
  try {
    isWanted = await toggleCardWanted(card);
  } catch (err) {
    console.error('Failed to update the wishlist:', err);
    showToast('Could not update the wishlist. Please try again.', 'error');
    return null;
  }

  syncCardWantedUi(cardElement, isWanted);

  showUndo(isWanted ? 'Added to wishlist' : 'Removed from wishlist', async () => {
    try {
      await setCardsWanted([card], !wasWanted);
    } catch (err) {
      console.error('Failed to undo wishlist change:', err);
      showToast('Could not undo the change.', 'error');
      return;
    }
    syncCardWantedUi(cardElement, !wasWanted);
  });

  return isWanted;
}

/**
 * Toggle a card's ownership, updating the tile, the global/binder counters and
 * the undo toast.
 *
 * @param {HTMLElement} cardElement
 * @param {object} card
 * @returns {Promise<boolean|null>} the new owned state, or null on failure.
 */
async function toggleCardOwnership(cardElement, card) {
  if (!cardElement || !card) return null;

  const wasMissing = !isCardOwned(card);

  let isOwned;
  try {
    isOwned = await toggleCardOwned(card);
  } catch (err) {
    console.error('Failed to update card ownership:', err);
    showToast('Could not update the card. Please try again.', 'error');
    return null;
  }

  syncCardOwnedUi(cardElement, isOwned);
  updateOwnedCounter();
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

  return isOwned;
}

/**
 * Advance a tile to its next (or previous) printing and refresh it. Desktop
 * right-click, the tooltip's "Next printing" button and the modal's ↑/↓ keys all
 * route through here.
 */
function cycleCardPrinting(cardElement, event, tooltip, direction = 1) {
  if (!cardElement || !cardElement.cardData) return;

  const next = nextPrinting(
    cardStore.getPrintings(cardElement.cardData.name),
    cardElement.cardData,
    direction
  );
  if (!next) return;

  // Remember the pick so the grid keeps showing this printing on later loads.
  // Persisted from the view-only share path too: choosing art is a view action,
  // not an ownership edit.
  rememberPreferredPrinting(next);

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

  // Desktop long-press opens the preview (a short click still toggles).
  container.addEventListener('mousedown', (event) => handleMouseDown(event, tooltip));
  container.addEventListener('mousemove', handleMouseMove);
  container.addEventListener('mouseup', cancelMousePress);
  container.addEventListener('mouseleave', cancelMousePress);

  // `randomCard.js` asks for a preview without importing this module (which
  // would create an import cycle).
  if (previewHandler) document.removeEventListener('card:preview', previewHandler);
  previewHandler = (event) => {
    const { element, card } = event.detail || {};
    if (element && card) openPreview(element, card, tooltip, { clientX: 0, clientY: 0 });
  };
  document.addEventListener('card:preview', previewHandler);
}
