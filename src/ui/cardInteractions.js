// src/ui/cardInteractions.js
import { showTooltip, hideTooltip, positionTooltip } from './tooltip.js';
import { cardSettings } from '../state/cardSettings.js';
import { appState } from '../state/appState.js';
import { isCardOwned, toggleCardOwned, setCardsOwned } from '../state/cardState.js';
import { showUndo, showToast } from './components/toast.js';
import { updateOwnedCounter } from './components/ownedCounter.js';
import { adjustBinderOwnedCount } from './layout.js';
import { cardStore } from '../state/cardStore.js';
import { preloadCardImages } from '../utils/cardImages.js';
import { nextPrinting } from '../utils/printings.js';
import { refreshCardElement } from './cards.js';

// Use a WeakMap to associate state with an element without memory leaks or polluting the DOM
const elementState = new WeakMap();

function getState(el) {
  if (!elementState.has(el)) {
    elementState.set(el, {});
  }
  return elementState.get(el);
}

// Hover-intent preloading: start fetching a card's image shortly after the
// cursor settles on it, so it is usually ready before the tooltip appears.
const PRELOAD_DELAY_MS = 120;
let preloadTimer;
let preloadCard = null;

function schedulePreload(cardElement) {
  if (!cardElement || preloadCard === cardElement) return;
  preloadCard = cardElement;
  clearTimeout(preloadTimer);
  preloadTimer = setTimeout(() => {
    if (preloadCard === cardElement) {
      preloadCardImages(cardElement.cardData);
    }
  }, PRELOAD_DELAY_MS);
}

function cancelPreload(cardElement) {
  if (preloadCard === cardElement) {
    clearTimeout(preloadTimer);
    preloadCard = null;
  }
}

// --- Delegated Event Handlers ---

// Touch devices synthesize mouse events around a tap (mouseover → click). Those
// would open the hover tooltip and then have the tap swallowed by the tooltip's
// click guard, so ignore mouse events briefly after any touch.
const TOUCH_MOUSE_GRACE_MS = 700;
let lastTouchAt = 0;
function isSyntheticMouseEvent() {
  return Date.now() - lastTouchAt < TOUCH_MOUSE_GRACE_MS;
}

function handleMouseEnter(event, tooltip) {
  if (isSyntheticMouseEvent()) return;
  if (!cardSettings.showTooltip) return;
  const cardElement = event.target.closest('.card');
  if (cardElement) {
    schedulePreload(cardElement);
    cardElement.setAttribute('aria-describedby', 'tooltip');
    // Touch devices have no right-click, so the tooltip's "Next printing"
    // button drives the cycle through this handler. View-only shares cannot
    // cycle, so leave the button off there.
    tooltip.onCycle = appState.isViewOnlyMode
      ? null
      : (cycleEvent) => cycleCardPrinting(cardElement, cycleEvent, tooltip);
    showTooltip(event, cardElement.cardData, tooltip);
  }
}

function handleMouseLeave(event, tooltip) {
  if (isSyntheticMouseEvent()) return;
  if (!cardSettings.showTooltip) return;
  const cardElement = event.target.closest('.card');
  // Check relatedTarget to prevent hiding when moving between child elements
  if (
    cardElement &&
    !cardElement.contains(event.relatedTarget) &&
    !tooltip.contains(event.relatedTarget)
  ) {
    cancelPreload(cardElement);
    hideTooltip(tooltip);
    cardElement.removeAttribute('aria-describedby');
    tooltip.onCycle = null;
  }
}

function handleMouseMove(event, tooltip) {
  if (cardSettings.showTooltip && tooltip.style.display !== 'none') {
    positionTooltip(event, tooltip);
  }
}

let touchTimer;
let touchStartX, touchStartY;
function handleTouchStart(event, tooltip) {
  const cardElement = event.target.closest('.card');
  if (!cardElement) return;

  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
  lastTouchAt = Date.now();

  const state = getState(cardElement);
  state.isLongPress = false;

  // The open tooltip owns the cycle action on touch (no right-click).
  tooltip.onCycle = appState.isViewOnlyMode
    ? null
    : (cycleEvent) => cycleCardPrinting(cardElement, cycleEvent, tooltip);

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
  lastTouchAt = Date.now();
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
  // Ignore clicks if they aren't on a card, are on the EDHREC link, or in view-only mode
  if (!cardElement || event.target.closest('.edhrec-link') || appState.isViewOnlyMode) {
    return;
  }

  // The full-screen mobile tooltip is open: the tap that dismissed (or opened)
  // it must not also mark the card owned.
  if (tooltip && tooltip.classList.contains('mobile')) return;

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

  cardElement.classList.toggle('owned', isOwned);

  const toggleBtn = cardElement.querySelector('.card-toggle');
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-pressed', isOwned.toString());
    toggleBtn.setAttribute('aria-label', isOwned ? 'Mark as missing' : 'Mark as owned');
  }

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
    cardElement.classList.toggle('owned', !wasMissing);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', (!wasMissing).toString());
      toggleBtn.setAttribute('aria-label', wasMissing ? 'Mark as owned' : 'Mark as missing');
    }
    updateOwnedCounter();
    adjustBinderOwnedCount(cardElement.closest('.binder'), wasMissing ? -1 : 1);
  });
}

/**
 * Advance a tile to its next printing and refresh both the tile and the open
 * tooltip. Shared by desktop right-click and the tooltip's "Next printing"
 * button (the only route on touch devices).
 */
function cycleCardPrinting(cardElement, event, tooltip) {
  if (!cardElement || !cardElement.cardData || appState.isViewOnlyMode) return;

  const next = nextPrinting(
    cardStore.getPrintings(cardElement.cardData.name),
    cardElement.cardData
  );
  if (!next) return;

  cardElement.cardData = next;

  // Keep the tile in sync with the printing the tooltip now shows (matters in
  // image mode, where the artwork differs per printing).
  refreshCardElement(cardElement);

  showTooltip(event, next, tooltip);
}

function handleContextMenu(event, tooltip) {
  const cardElement = event.target.closest('.card');
  if (!cardElement) return;

  event.preventDefault();

  if (tooltip.style.display === 'none') return;

  cycleCardPrinting(cardElement, event, tooltip);
}

// --- Main Initialization ---

export function initCardInteractions(container, tooltip) {
  container.addEventListener('mouseover', (e) => handleMouseEnter(e, tooltip));
  container.addEventListener('mouseout', (e) => handleMouseLeave(e, tooltip));
  container.addEventListener('mousemove', (e) => handleMouseMove(e, tooltip));
  container.addEventListener('click', (e) => handleContainerClick(e, tooltip));
  container.addEventListener('contextmenu', (e) => handleContextMenu(e, tooltip));

  container.addEventListener('touchstart', (e) => handleTouchStart(e, tooltip), { passive: true });
  container.addEventListener('touchmove', handleTouchMove, { passive: true });
  container.addEventListener('touchend', handleTouchEnd);
}
