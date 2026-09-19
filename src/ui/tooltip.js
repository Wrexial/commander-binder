// tooltip.js
import { getImage } from '../utils/imageCache.js';
import { getCardImages } from '../utils/cardImages.js';
import { getDisplayedPrice } from '../utils/prices.js';
import { isHoverCapable } from '../utils/pointer.js';
import { cardSettings } from '../state/cardSettings.js';
import { cardStore } from '../state/cardStore.js';
import { isCardOwned } from '../state/cardState.js';

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
 * @returns {HTMLElement}
 */
function createTooltipDetails(card, version) {
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
      priceEl.textContent = `€${price.toFixed(2)}`;
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

  const owned = isCardOwned(card);
  const badge = document.createElement('span');
  badge.className = `tooltip-owned-status ${owned ? 'owned' : 'missing'}`;
  badge.textContent = owned ? 'Owned' : 'Missing';
  status.appendChild(badge);
  details.appendChild(status);

  return details;
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
    // A horizontal drag moves between cards; keep the browser from scrolling
    // or triggering a back-navigation instead.
    if (event.cancelable) event.preventDefault();
    swipe.dx = dx;
    return;
  }

  const tooltip = swipe.tooltip;
  // Only the full-screen dialog dismisses on a downward drag; the floating
  // tooltip leaves vertical movement to the page scroll.
  if (!tooltip.classList.contains('mobile') || dy <= 0 || tooltip.scrollTop > 0) {
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
export function showTooltip(e, card, tooltip) {
  if (!cardSettings.showTooltip) {
    return;
  }

  hideTooltip(tooltip);
  activeTooltip = tooltip;
  tooltip.currentCard = card;

  // Choose the layout up front. On phones the tooltip becomes a fixed,
  // centred full-screen dialog, and the class must be set before the long-press
  // gesture ends so its trailing tap cannot toggle ownership.
  const mobile = isMobileLayout();
  tooltip.classList.toggle('mobile', mobile);
  if (mobile) {
    tooltip.style.left = '';
    tooltip.style.top = '';
    getBackdrop().classList.add('visible');
    document.body.classList.add('tooltip-open');
  }

  // Swipe gestures: the full-screen dialog always supports them (swipe down to
  // dismiss, left/right to change card). The floating desktop-style tooltip —
  // which is what wide touch screens get — supports left/right navigation too,
  // but needs pointer events so the touch actually reaches it.
  const swipeNav = typeof tooltip.onNavigate === 'function';
  if (mobile || swipeNav) bindSwipeGestures(tooltip);
  tooltip.classList.toggle('swipe-nav', !mobile && swipeNav);

  tooltipTimeout = setTimeout(() => renderTooltipContent(card, tooltip, e), 200);
}

/**
 * Swap the open tooltip to another card without closing it. The mobile swipe
 * gesture calls this after the host has pointed `onCycle`/`onNavigate` at the
 * new card. Assumes the tooltip is already open.
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
  const mobile = tooltip.classList.contains('mobile');

  tooltip.innerHTML = ''; // Clear existing content

  if (mobile) tooltip.appendChild(createCloseButton(tooltip));

  const imageContainer = document.createElement('div');
  imageContainer.className = 'tooltip-image-container';
  imageContainer.innerHTML = `<div class="loading">Loading...</div>`;
  tooltip.appendChild(imageContainer);

  const position = cardStore.getPrintingPosition(card);

  // Phones hide the tile footer (too cramped at 3 columns), so the tooltip
  // carries the card's details instead.
  if (mobile) {
    tooltip.appendChild(createTooltipDetails(card, position));

    if (typeof tooltip.onNavigate === 'function') {
      const hint = document.createElement('div');
      hint.className = 'tooltip-swipe-hint';
      hint.textContent = 'Swipe for previous / next card';
      tooltip.appendChild(hint);
    }
  }

  // The tooltip also carries the explicit cycle control that touch devices
  // need (they have no right-click).
  if (position.total > 1 && typeof tooltip.onCycle === 'function') {
    const textContainer = document.createElement('div');
    textContainer.className = 'tooltip-text-container';

    const cycleBtn = document.createElement('button');
    cycleBtn.type = 'button';
    cycleBtn.className = 'printing-cycle';
    // Hosts can override the label (e.g. the PC statistics modal asks for
    // "Right-click for next printing"), but on touch devices right-click does
    // not exist, so always fall back to the plain wording there.
    const showRightClickLabel = !mobile && isHoverCapable();
    cycleBtn.textContent = (showRightClickLabel && tooltip.cycleLabel) || 'Next printing';
    cycleBtn.title = 'Show the next printing (right-click also works)';
    cycleBtn.addEventListener('click', (clickEvent) => {
      clickEvent.stopPropagation();
      tooltip.onCycle(clickEvent);
    });
    textContainer.appendChild(cycleBtn);
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

  const isMobile = isMobileLayout();
  const maxTooltipHeight = window.innerHeight * (isMobile ? 0.8 : 0.6);
  const maxTooltipWidth = window.innerWidth * (isMobile ? 0.92 : 0.8);
  const imgWidth = Math.min(maxTooltipWidth / images.length, isMobile ? 340 : 300);

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
  if (tooltip.classList.contains('mobile')) lastDismissAt = Date.now();
  tooltip.classList.remove('show');
  tooltip.classList.remove('mobile');
  tooltip.classList.remove('swipe-nav');
  tooltip.style.display = 'none';
  activeTooltip = null;
  tooltip.innerHTML = '';

  if (backdrop) backdrop.classList.remove('visible');
  document.body.classList.remove('tooltip-open');
}

// ---------------- Position Tooltip ----------------
export function positionTooltip(e, tooltip) {
  // The mobile dialog is centred by CSS; never chase the pointer.
  if (tooltip.classList.contains('mobile')) return;

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
    if (activeTooltip) {
      hideTooltip(activeTooltip);
    }
  },
  { passive: true }
);

// The full-screen dialog dismisses itself through its backdrop and close button.
// A desktop-style tooltip — which is what wide touch screens get — has neither,
// so it is dismissed by the next tap outside it. The guard keeps that same tap
// from also toggling the card underneath.
window.addEventListener(
  'touchstart',
  (e) => {
    if (!activeTooltip || activeTooltip.classList.contains('mobile')) return;
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
