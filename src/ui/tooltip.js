// tooltip.js
import { getImage } from '../utils/imageCache.js';
import { getCardImages } from '../utils/cardImages.js';
import { cardSettings } from '../state/cardSettings.js';
import { cardStore } from '../state/cardStore.js';

let tooltipTimeout;
let activeTooltip = null;

const MOBILE_QUERY = '(max-width: 768px)';

/** True on the phone layout, where the tooltip is shown full-screen. */
function isMobileLayout() {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches;
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

// ---------------- Show Tooltip ----------------
export function showTooltip(e, card, tooltip) {
  if(!cardSettings.showTooltip){
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

    const textContainer = document.createElement('div');
    textContainer.className = 'tooltip-text-container';
    tooltip.appendChild(textContainer);
    
    const { index, total } = cardStore.getPrintingPosition(card);
    if (total > 1) {
        const indicator = document.createElement('span');
        indicator.className = 'printing-indicator';
        indicator.textContent = `Version ${index} of ${total}`;
        textContainer.appendChild(indicator);

        // Touch devices have no right-click, so offer an explicit control. The
        // host (card grid or statistics) supplies the cycle behaviour.
        if (typeof tooltip.onCycle === 'function') {
            const cycleBtn = document.createElement('button');
            cycleBtn.type = 'button';
            cycleBtn.className = 'printing-cycle';
            cycleBtn.textContent = 'Next printing';
            cycleBtn.title = 'Show the next printing (right-click also works)';
            cycleBtn.addEventListener('click', (clickEvent) => {
                clickEvent.stopPropagation();
                tooltip.onCycle(clickEvent);
            });
            textContainer.appendChild(cycleBtn);
        }
    }

    const prices = [card.prices.eur, card.prices.eur_foil].filter(p => p).map(p => parseFloat(p));
    const price = prices.length > 0 ? Math.min(...prices) : null;

    const descriptor = document.createElement('div');
    descriptor.className = 'card-descriptor';
    descriptor.textContent = `${card.set_name} #${card.collector_number} · €${price !== null ? price.toFixed(2) : 'N/A'}`;
    textContainer.appendChild(descriptor);

    tooltip.style.display = "flex";

    const images = [];

    function addImage(url, key) {
      const img = getImage(url);
      if (!img) return;
      img.alt = key;
      images.push(img);
    }

    // ---------------- Handle card images ----------------
    getCardImages(card).forEach(({ url, key }) => addImage(url, key));

    // ---------------- Wait for all images / flip cards to load ----------------
    let loaded = 0;
    images.forEach(el => {
      if (el.tagName === "IMG") {
        // If the image is already loaded (from cache/clone), the load event won't fire — handle that
        if (el.complete && el.naturalWidth > 0) {
          loaded++;
          if (loaded === images.length) finishTooltip(images, tooltip, e);
        } else {
          el.onload = el.onerror = () => {
            loaded++;
            if (loaded === images.length) finishTooltip(images, tooltip, e);
          };
        }
      } else {
        // Flip card container is already ready
        loaded++;
        if (loaded === images.length) finishTooltip(images, tooltip, e);
      }
    });

    positionTooltip(e, tooltip);
    
    tooltip.style.display = "flex";
    requestAnimationFrame(() => {
      tooltip.classList.add("show");
      positionTooltip(e, tooltip);
    });

  }, 200);
}

// ---------------- Render Tooltip ----------------
function finishTooltip(images, tooltip, event) {
  const imageContainer = tooltip.querySelector('.tooltip-image-container');
  if (!imageContainer) return;

  imageContainer.innerHTML = "";

  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.gap = "8px";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";

  const isMobile = isMobileLayout();
  const maxTooltipHeight = window.innerHeight * (isMobile ? 0.8 : 0.6);
  const maxTooltipWidth = window.innerWidth * (isMobile ? 0.92 : 0.8);
  const imgWidth = Math.min(maxTooltipWidth / images.length, isMobile ? 340 : 300);

  images.forEach(el => {
    if (el.tagName === "IMG") {
      el.style.maxWidth = `${imgWidth}px`;
      el.style.maxHeight = `${maxTooltipHeight}px`;
      el.style.borderRadius = "10px";
    } else {
      // Flip card container
      el.style.width = `${imgWidth}px`;
      el.style.maxHeight = `${maxTooltipHeight}px`;
    }
    container.appendChild(el);
  });

  imageContainer.appendChild(container);

  tooltip.classList.add("show"); // trigger scale/fade animation

  // After adding images to tooltip
  tooltip.classList.toggle("mdfc", images.length > 1);

  positionTooltip(event, tooltip);
}

// ---------------- Hide Tooltip ----------------
export function hideTooltip(tooltip) {
  clearTimeout(tooltipTimeout);
  tooltip.classList.remove("show");
  tooltip.classList.remove("mobile");
  tooltip.style.display = "none";
  activeTooltip = null;
  tooltip.innerHTML = "";

  if (backdrop) backdrop.classList.remove("visible");
  document.body.classList.remove("tooltip-open");
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
  "scroll",
  () => {
    if (activeTooltip) {
      hideTooltip(activeTooltip);
    }
  },
  { passive: true }
);

window.addEventListener(
  "touchstart",
  (e) => {
    if (activeTooltip && !activeTooltip.contains(e.target)) {
      hideTooltip(activeTooltip);
    }
  },
  { passive: true }
);

window.addEventListener("orientationchange", () => {
  if (activeTooltip) {
    hideTooltip(activeTooltip);
  }
});