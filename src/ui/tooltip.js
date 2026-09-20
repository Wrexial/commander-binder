// tooltip.js
import { getImage } from '../utils/imageCache.js';
import { getCardImages } from '../utils/cardImages.js';
import { getDisplayedPrice, formatPrice } from '../utils/prices.js';
import { isHoverCapable } from '../utils/pointer.js';
import { cardStore } from '../state/cardStore.js';
import { isCardOwned } from '../state/cardState.js';
import { isCardWanted } from '../state/wishlistState.js';
import { getListsForCard } from '../state/listsState.js';

let tooltipTimeout;
let activeTooltip = null;

// Drag further than this (in CSS px) to dismiss the mobile dialog.
const SWIPE_DISMISS_DISTANCE = 90;

// Horizontal drag needed to move to the previous / next card.
const SWIPE_NAVIGATE_DISTANCE = 60;

// Movement before a gesture commits to an axis, so a diagonal drag can never
// both navigate and dismiss.
const SWIPE_AXIS_LOCK = 12;

// How long a dismissing tap keeps the grid from treating the trailing
// synthesized click as a card tap of its own.
const DISMISS_CLICK_GRACE_MS = 400;
let lastDismissAt = 0;

const MOBILE_QUERY = '(max-width: 768px)';

/** True on the phone layout, where the tooltip is shown full-screen. */
function isMobileLayout() {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * True while a tap belongs to the preview rather than the grid: the dialog is
 * open, or it was dismissed by the gesture that is still finishing. Callers use
 * it to swallow the trailing click, so one tap never does two things.
 *
 * @returns {boolean}
 */
export function isTooltipGestureActive() {
  return activeTooltip !== null || Date.now() - lastDismissAt < DISMISS_CLICK_GRACE_MS;
}

/** Full-screen tap-catcher shown behind the mobile tooltip. */
let backdrop = null;
function getBackdrop() {
  if (backdrop && !backdrop.isConnected) backdrop = null;
  if (backdrop) return backdrop;

  backdrop = document.createElement('div');
  backdrop.className = 'tooltip-backdrop';
  backdrop.addEventListener('click', () => {
    if (activeTooltip) hideTooltip(activeTooltip);
  });
  document.body.appendChild(backdrop);
  return backdrop;
}

/**
 * Build the card details shown inside the mobile tooltip: name, set/number,
 * price, printing count, EDHREC link and owned status. Mirrors the desktop tile
 * footer, which is hidden on phones because it crowds the small image grid.
 *
 * @param {object} card
 * @param {{index: number, total: number}} version
 * @param {HTMLElement|null} [printingControl] "Choose printing" button to place
 *   beside the owned/missing badge.
 * @param {HTMLElement} [tooltip] Host element; when it exposes `onToggle`, the
 *   owned/missing badge becomes a button that flips the status.
 * @returns {HTMLElement}
 */
function createTooltipDetails(card, version, printingControl, tooltip) {
  const details = document.createElement('div');
  details.className = 'tooltip-card-details';

  const name = document.createElement('div');
  name.className = 'tooltip-card-name';
  name.textContent = card.name;
  details.appendChild(name);

  // Keep the meta on a single line where it fits: the set name is the only
  // part allowed to truncate, so the number/printing count always stay visible.
  // The price is its own pill so a long set name can never push it out.
  const price = getDisplayedPrice(card);
  const restParts = [];
  if (card.collector_number) restParts.push(`#${card.collector_number}`);
  if (version.total > 1) restParts.push(`${version.index}/${version.total} printings`);

  if (price !== null || card.set_name || restParts.length > 0) {
    const meta = document.createElement('div');
    meta.className = 'tooltip-card-meta';

    if (price !== null) {
      const priceEl = document.createElement('span');
      priceEl.className = 'tooltip-card-price';
      priceEl.textContent = formatPrice(price);
      meta.appendChild(priceEl);
    }

    if (card.set_name) {
      const setEl = document.createElement('span');
      setEl.className = 'tooltip-card-set';
      setEl.textContent = card.set_name;
      meta.appendChild(setEl);
    }

    if (restParts.length > 0) {
      const restEl = document.createElement('span');
      restEl.className = 'tooltip-card-meta-rest';
      restEl.textContent = (card.set_name ? '· ' : '') + restParts.join(' · ');
      meta.appendChild(restEl);
    }

    details.appendChild(meta);
  }

  const status = document.createElement('div');
  status.className = 'tooltip-card-status';

  if (card.related_uris?.edhrec) {
    const link = document.createElement('a');
    link.className = 'tooltip-edhrec-link';
    link.href = card.related_uris.edhrec;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'View on EDHREC');
    status.appendChild(link);
  }

  const canToggle = typeof tooltip?.onToggle === 'function';
  const badge = document.createElement(canToggle ? 'button' : 'span');
  setOwnedStatus(badge, isCardOwned(card));

  if (canToggle) {
    badge.type = 'button';
    badge.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (badge.disabled) return;
      badge.disabled = true;
      try {
        const next = await tooltip.onToggle();
        if (typeof next === 'boolean') setOwnedStatus(badge, next);
      } finally {
        badge.disabled = false;
      }
    });
  }

  status.appendChild(badge);

  // The wishlist toggle mirrors the owned one, so the heart is reachable on
  // phones where the image-tile footer (and its inline heart) is hidden.
  const canWishlist = typeof tooltip?.onWishlistToggle === 'function';
  const wishlistBadge = document.createElement(canWishlist ? 'button' : 'span');
  setWishlistStatus(wishlistBadge, isCardWanted(card));

  if (canWishlist) {
    wishlistBadge.type = 'button';
    wishlistBadge.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (wishlistBadge.disabled) return;
      wishlistBadge.disabled = true;
      try {
        const next = await tooltip.onWishlistToggle();
        if (typeof next === 'boolean') setWishlistStatus(wishlistBadge, next);
      } finally {
        wishlistBadge.disabled = false;
      }
    });
  }

  status.appendChild(wishlistBadge);

  // Membership in the user's custom lists. The picker also works read-only in a
  // share view, so a visitor can see which public lists hold the card.
  if (typeof tooltip?.onAddToList === 'function') {
    const listButton = document.createElement('button');
    listButton.type = 'button';
    listButton.className = 'tooltip-list-button';
    const listCount = getListsForCard(card).length;
    listButton.textContent = listCount > 0 ? `\uD83D\uDCCB Lists (${listCount})` : 'Add to list';
    listButton.title = listCount > 0 ? 'Edit list membership' : 'Add to a list';
    listButton.addEventListener('click', (event) => {
      event.stopPropagation();
      tooltip.onAddToList();
    });
    status.appendChild(listButton);
  }

  // The printing-cycle control lives next to the owned/missing badge, so the
  // swipe hint below never pushes it off screen.
  if (printingControl) status.appendChild(printingControl);

  details.appendChild(status);

  return details;
}

/**
 * The explicit "choose printing" control. Placed beside the owned/missing badge
 * in the modal preview, or on its own row in the floating hover preview.
 *
 * @param {HTMLElement} tooltip
 * @returns {HTMLButtonElement}
 */
function createPrintingButton(tooltip) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'printing-cycle';
  button.textContent = 'Choose printing';
  button.title = 'Choose a printing';
  button.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation();
    tooltip.onChoosePrinting(clickEvent);
  });
  return button;
}

/**
 * Reflect an owned/missing status on the badge (span or button).
 * @param {HTMLElement} element
 * @param {boolean} owned
 */
function setOwnedStatus(element, owned) {
  element.className = `tooltip-owned-status ${owned ? 'owned' : 'missing'}`;
  element.textContent = owned ? 'Owned' : 'Missing';

  if (element.tagName === 'BUTTON') {
    element.setAttribute('aria-pressed', String(owned));
    element.title = owned ? 'Mark as missing' : 'Mark as owned';
    element.setAttribute('aria-label', element.title);
  }
}

/**
 * Reflect a wanted/not-wanted status on the badge (span or button).
 * @param {HTMLElement} element
 * @param {boolean} wanted
 */
function setWishlistStatus(element, wanted) {
  element.className = `tooltip-wishlist-status ${wanted ? 'wanted' : 'not-wanted'}`;
  element.textContent = wanted ? 'Wanted' : 'Not wanted';

  if (element.tagName === 'BUTTON') {
    element.setAttribute('aria-pressed', String(wanted));
    element.title = wanted ? 'Remove from wishlist' : 'Add to wishlist';
    element.setAttribute('aria-label', element.title);
  }
}

/**
 * Explicit close control for the full-screen dialog: the dimmed edge around a
 * centred dialog is a thin, unreliable target on a phone.
 * @param {HTMLElement} tooltip
 * @returns {HTMLButtonElement}
 */
function createCloseButton(tooltip) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tooltip-close';
  button.setAttribute('aria-label', 'Close card preview');
  button.innerHTML = '&times;';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    hideTooltip(tooltip);
  });
  return button;
}

// ---------------- Swipe to dismiss (mobile) ----------------
// The full-screen dialog is dismissed by swiping it down; the fade follows the
// finger so the gesture is discoverable rather than an invisible trap door.
const swipeBound = new WeakSet();
let swipe = null;

function resetSwipe() {
  if (!swipe) return;
  swipe.tooltip.classList.remove('dragging');
  swipe.tooltip.style.transform = '';
  swipe.tooltip.style.opacity = '';
  swipe = null;
}

function onSwipeStart(event) {
  const tooltip = event.currentTarget;
  const touch = event.touches[0];
  if (!touch) return;
  swipe = {
    tooltip,
    startX: touch.clientX,
    startY: touch.clientY,
    dx: 0,
    dy: 0,
    axis: null,
  };
}

function onSwipeMove(event) {
  if (!swipe) return;
  const touch = event.touches[0];
  if (!touch) return;

  const dx = touch.clientX - swipe.startX;
  const dy = touch.clientY - swipe.startY;

  // Lock to one axis on the first meaningful movement.
  if (!swipe.axis) {
    if (Math.abs(dx) < SWIPE_AXIS_LOCK && Math.abs(dy) < SWIPE_AXIS_LOCK) return;
    swipe.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }

  if (swipe.axis === 'x') {
    // A horizontal drag moves between cards: follow the finger so the gesture
    // reads as "slide to the next/previous card", and keep the browser from
    // scrolling or triggering a back-navigation instead.
    if (event.cancelable) event.preventDefault();
    swipe.dx = dx;
    const tooltip = swipe.tooltip;
    tooltip.classList.add('dragging');
    tooltip.style.transform = `translateX(${dx}px)`;
    tooltip.style.opacity = String(Math.max(0.55, 1 - Math.abs(dx) / 400));
    return;
  }

  const tooltip = swipe.tooltip;
  // Only the modal dialog dismisses on a downward drag; the floating preview
  // leaves vertical movement to the page scroll.
  if (!tooltip.classList.contains('modal') || dy <= 0 || tooltip.scrollTop > 0) {
    resetSwipe();
    return;
  }

  if (event.cancelable) event.preventDefault();
  swipe.dy = dy;
  tooltip.classList.add('dragging');
  tooltip.style.transform = `translateY(${dy}px)`;
  tooltip.style.opacity = String(Math.max(0.3, 1 - dy / 320));
}

function onSwipeEnd(event) {
  if (!swipe) return;
  const { tooltip, dx, dy, axis } = swipe;
  resetSwipe();

  // A cancelled gesture (system swipe, interrupted touch) does neither.
  if (event?.type === 'touchcancel') return;

  if (axis === 'x') {
    if (Math.abs(dx) >= SWIPE_NAVIGATE_DISTANCE && typeof tooltip.onNavigate === 'function') {
      // Swipe left -> next card, swipe right -> previous card.
      tooltip.onNavigate(dx < 0 ? 1 : -1, { clientX: 0, clientY: 0 });
    }
    return;
  }

  if (dy > SWIPE_DISMISS_DISTANCE) hideTooltip(tooltip);
}

function bindSwipeGestures(tooltip) {
  if (swipeBound.has(tooltip)) return;
  swipeBound.add(tooltip);
  tooltip.addEventListener('touchstart', onSwipeStart, { passive: true });
  // Not passive: a horizontal drag must not also scroll the page.
  tooltip.addEventListener('touchmove', onSwipeMove, { passive: false });
  tooltip.addEventListener('touchend', onSwipeEnd);
  tooltip.addEventListener('touchcancel', onSwipeEnd);
}

// ---------------- Show Tooltip ----------------
export function showTooltip(e, card, tooltip, { modal = isMobileLayout() } = {}) {
  hideTooltip(tooltip);
  activeTooltip = tooltip;
  tooltip.currentCard = card;

  // The modal preview is a centred dialog with a backdrop; the floating
  // preview (used by the statistics hover) chases the pointer instead. Set the
  // class before the long-press gesture ends so its trailing tap cannot toggle
  // ownership.
  tooltip.classList.toggle('modal', modal);
  if (modal) {
    // The centred preview is a dialog, not a hover tooltip: mark it so assistive
    // tech announces the close control and the modal boundary.
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-modal', 'true');
    tooltip.style.left = '';
    tooltip.style.top = '';
    getBackdrop().classList.add('visible');
    document.body.classList.add('tooltip-open');
  } else {
    tooltip.setAttribute('role', 'tooltip');
    tooltip.removeAttribute('aria-modal');
  }

  // Swipe gestures: the modal dialog supports swipe-down to dismiss and
  // left/right to change card. A floating preview only needs left/right when a
  // navigation handler is set, and needs pointer events to receive the touch.
  const swipeNav = typeof tooltip.onNavigate === 'function';
  if (modal || swipeNav) bindSwipeGestures(tooltip);
  tooltip.classList.toggle('swipe-nav', !modal && swipeNav);

  tooltipTimeout = setTimeout(() => renderTooltipContent(card, tooltip, e), 200);
}

/**
 * Swap the open tooltip to another card without closing it. The mobile swipe
 * gesture calls this after the host has pointed `onChoosePrinting`/`onNavigate`
 * at the new card. Assumes the tooltip is already open.
 *
 * @param {object} card
 * @param {HTMLElement} tooltip
 * @param {{clientX: number, clientY: number}} e Synthetic pointer event.
 */
export function showTooltipCard(card, tooltip, e) {
  if (activeTooltip !== tooltip) return;
  clearTimeout(tooltipTimeout);
  tooltip.currentCard = card;
  // Keep the floating tooltip where it is; only the first open positions it.
  renderTooltipContent(card, tooltip, e, { reposition: false });
}

/** Build (or rebuild) the tooltip's contents for `card`. */
function renderTooltipContent(card, tooltip, e, { reposition = true } = {}) {
  const modal = tooltip.classList.contains('modal');

  tooltip.innerHTML = ''; // Clear existing content

  if (modal) tooltip.appendChild(createCloseButton(tooltip));

  const imageContainer = document.createElement('div');
  imageContainer.className = 'tooltip-image-container';
  imageContainer.innerHTML = `<div class="loading">Loading...</div>`;
  tooltip.appendChild(imageContainer);

  const position = cardStore.getPrintingPosition(card);

  // The explicit "choose printing" control. Touch devices have no right-click,
  // and right-click now opens the picker too.
  const printingControl =
    position.total > 1 && typeof tooltip.onChoosePrinting === 'function'
      ? createPrintingButton(tooltip)
      : null;

  if (modal) {
    tooltip.appendChild(createTooltipDetails(card, position, printingControl, tooltip));

    if (typeof tooltip.onNavigate === 'function') {
      const hint = document.createElement('div');
      hint.className = 'tooltip-swipe-hint';
      hint.textContent = isHoverCapable()
        ? '\u2190 / \u2192 change card'
        : 'Swipe for previous / next card';
      tooltip.appendChild(hint);
    }
  } else if (printingControl) {
    // Floating hover preview (statistics): keep the button on its own row.
    const textContainer = document.createElement('div');
    textContainer.className = 'tooltip-text-container';
    textContainer.appendChild(printingControl);
    tooltip.appendChild(textContainer);
  }

  tooltip.style.display = 'flex';

  const images = getCardImages(card)
    .map(({ url, key }) => {
      const img = getImage(url);
      if (img) img.alt = card.name || key;
      return img;
    })
    .filter(Boolean);

  // Wait for every image so the tooltip can size itself correctly. Images
  // already decoded won't fire `load`, so handle that case directly.
  let loaded = 0;
  const onImageSettled = () => {
    loaded++;
    if (loaded === images.length) finishTooltip(images, tooltip, e, reposition);
  };

  images.forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      onImageSettled();
    } else {
      img.addEventListener('load', onImageSettled, { once: true });
      img.addEventListener('error', onImageSettled, { once: true });
    }
  });

  if (reposition) positionTooltip(e, tooltip);

  requestAnimationFrame(() => {
    tooltip.classList.add('show');
    if (reposition) positionTooltip(e, tooltip);
  });
}

// ---------------- Render Tooltip ----------------
function finishTooltip(images, tooltip, event, reposition = true) {
  const imageContainer = tooltip.querySelector('.tooltip-image-container');
  if (!imageContainer) return;

  imageContainer.innerHTML = '';

  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.gap = '8px';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';

  const isModal = tooltip.classList.contains('modal');
  const maxTooltipHeight = window.innerHeight * (isModal ? 0.8 : 0.6);
  const maxTooltipWidth = window.innerWidth * (isModal ? 0.92 : 0.8);
  const imgWidth = Math.min(maxTooltipWidth / images.length, isModal ? 340 : 300);

  images.forEach((img) => {
    img.style.maxWidth = `${imgWidth}px`;
    img.style.maxHeight = `${maxTooltipHeight}px`;
    img.style.borderRadius = '10px';
    container.appendChild(img);
  });

  imageContainer.appendChild(container);

  tooltip.classList.add('show'); // trigger scale/fade animation

  // After adding images to tooltip
  tooltip.classList.toggle('mdfc', images.length > 1);

  if (reposition) positionTooltip(event, tooltip);
}

// ---------------- Hide Tooltip ----------------
export function hideTooltip(tooltip) {
  clearTimeout(tooltipTimeout);
  if (swipe && swipe.tooltip === tooltip) resetSwipe();
  // Arm the click guard before the class below disappears, so the tap that
  // dismissed the dialog cannot fall through to the card underneath.
  if (tooltip.classList.contains('modal')) lastDismissAt = Date.now();
  tooltip.classList.remove('show');
  tooltip.classList.remove('modal');
  tooltip.classList.remove('swipe-nav');
  tooltip.setAttribute('role', 'tooltip');
  tooltip.removeAttribute('aria-modal');
  tooltip.style.display = 'none';
  activeTooltip = null;
  tooltip.innerHTML = '';

  if (backdrop) backdrop.classList.remove('visible');
  document.body.classList.remove('tooltip-open');
}

// ---------------- Position Tooltip ----------------
export function positionTooltip(e, tooltip) {
  // The modal dialog is centred by CSS; never chase the pointer.
  if (tooltip.classList.contains('modal')) return;

  const padding = 12;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const rect = tooltip.getBoundingClientRect();

  let x = e.clientX + padding;
  let y = e.clientY + padding;

  // Flip horizontally if overflowing
  if (x + rect.width > vw - padding) {
    x = e.clientX - rect.width - padding;
  }

  // Clamp left
  x = Math.max(padding, x);

  // Flip vertically if overflowing
  if (y + rect.height > vh - padding) {
    y = e.clientY - rect.height - padding;
  }

  // Clamp top
  y = Math.max(padding, y);

  // Ensure it doesn't go off the right edge even after flip/clamp
  if (x + rect.width > vw - padding) {
    x = vw - rect.width - padding;
  }
  // Ensure it doesn't go off the bottom edge
  if (y + rect.height > vh - padding) {
    y = vh - rect.height - padding;
  }

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

window.addEventListener(
  'scroll',
  () => {
    // The modal is centred with the page locked, so scrolling underneath it must
    // not close it — this also lets "Surprise me" smooth-scroll to a card while
    // its preview opens. Only the floating hover preview follows the page.
    if (activeTooltip && !activeTooltip.classList.contains('modal')) {
      hideTooltip(activeTooltip);
    }
  },
  { passive: true }
);

// The modal dialog dismisses itself through its backdrop and close button. A
// floating preview (the statistics hover) has neither, so it is dismissed by the
// next tap outside it. The guard keeps that same tap from also toggling the card
// underneath.
window.addEventListener(
  'touchstart',
  (e) => {
    if (!activeTooltip || activeTooltip.classList.contains('modal')) return;
    if (activeTooltip.contains(e.target)) return;

    lastDismissAt = Date.now();
    hideTooltip(activeTooltip);
  },
  { passive: true }
);

window.addEventListener('orientationchange', () => {
  if (activeTooltip) {
    hideTooltip(activeTooltip);
  }
});

// Keyboard controls for the modal preview (desktop): arrows or J/K change card,
// Escape closes. The global shortcuts bail while a modal is open, so these keys
// belong to the preview.
document.addEventListener('keydown', (event) => {
  if (!activeTooltip || !activeTooltip.classList.contains('modal')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const key = event.key.toLowerCase();
  const onNavigate = activeTooltip.onNavigate;

  if ((key === 'arrowright' || key === 'j') && typeof onNavigate === 'function') {
    event.preventDefault();
    onNavigate(1, { clientX: 0, clientY: 0 });
  } else if ((key === 'arrowleft' || key === 'k') && typeof onNavigate === 'function') {
    event.preventDefault();
    onNavigate(-1, { clientX: 0, clientY: 0 });
  } else if (key === 'escape') {
    event.preventDefault();
    hideTooltip(activeTooltip);
  }
});
