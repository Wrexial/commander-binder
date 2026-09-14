// tooltip.js
import { getImage } from '../utils/imageCache.js';
import { getCardImages } from '../utils/cardImages.js';
import { getDisplayedPrice } from '../utils/prices.js';
import { cardSettings } from '../state/cardSettings.js';
import { cardStore } from '../state/cardStore.js';
import { isCardOwned } from '../state/cardState.js';

let tooltipTimeout;
let activeTooltip = null;

const MOBILE_QUERY = '(max-width: 768px)';
const HOVER_QUERY = '(hover: hover)';

/** True on the phone layout, where the tooltip is shown full-screen. */
function isMobileLayout() {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * True when the device has a real pointer, i.e. a right-click exists. Touch
 * devices synthesize mouse events, so the hover media query is the reliable
 * way to tell whether the "right-click" wording makes sense.
 */
function isHoverCapable() {
  return typeof window.matchMedia === 'function' && window.matchMedia(HOVER_QUERY).matches;
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

  const bits = [];
  if (card.set_name) bits.push(card.set_name);
  if (card.collector_number) bits.push(`#${card.collector_number}`);
  const price = getDisplayedPrice(card);
  if (price !== null) bits.push(`€${price.toFixed(2)}`);
  if (version.total > 1) bits.push(`${version.index}/${version.total} printings`);

  if (bits.length > 0) {
    const meta = document.createElement('div');
    meta.className = 'tooltip-card-meta';
    meta.textContent = bits.join(' · ');
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

// ---------------- Show Tooltip ----------------
export function showTooltip(e, card, tooltip) {
  if (!cardSettings.showTooltip) {
    return;
  }

  hideTooltip(tooltip);
  activeTooltip = tooltip;

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

  tooltipTimeout = setTimeout(() => {
    tooltip.innerHTML = ''; // Clear existing content

    const imageContainer = document.createElement('div');
    imageContainer.className = 'tooltip-image-container';
    imageContainer.innerHTML = `<div class="loading">Loading...</div>`;
    tooltip.appendChild(imageContainer);

    const position = cardStore.getPrintingPosition(card);

    // Phones hide the tile footer (too cramped at 3 columns), so the tooltip
    // carries the card's details instead.
    if (mobile) {
      tooltip.appendChild(createTooltipDetails(card, position));
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
      if (loaded === images.length) finishTooltip(images, tooltip, e);
    };

    images.forEach((img) => {
      if (img.complete && img.naturalWidth > 0) {
        onImageSettled();
      } else {
        img.addEventListener('load', onImageSettled, { once: true });
        img.addEventListener('error', onImageSettled, { once: true });
      }
    });

    positionTooltip(e, tooltip);

    requestAnimationFrame(() => {
      tooltip.classList.add('show');
      positionTooltip(e, tooltip);
    });
  }, 200);
}

// ---------------- Render Tooltip ----------------
function finishTooltip(images, tooltip, event) {
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

  positionTooltip(event, tooltip);
}

// ---------------- Hide Tooltip ----------------
export function hideTooltip(tooltip) {
  clearTimeout(tooltipTimeout);
  tooltip.classList.remove('show');
  tooltip.classList.remove('mobile');
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

window.addEventListener(
  'touchstart',
  (e) => {
    if (activeTooltip && !activeTooltip.contains(e.target)) {
      hideTooltip(activeTooltip);
    }
  },
  { passive: true }
);

window.addEventListener('orientationchange', () => {
  if (activeTooltip) {
    hideTooltip(activeTooltip);
  }
});
