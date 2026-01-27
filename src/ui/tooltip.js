// tooltip.js
import { imageCache } from '../config/constants.js';
import { cardSettings } from '../state/cardSettings.js';
import { cardStore } from '../state/cardStore.js';

let tooltipTimeout;
let activeTooltip = null;

const multiLayouts = ["modal_dfc", "transform", "double_faced_token"];

// ---------------- Show Tooltip ----------------
export function showTooltip(e, card, tooltip) {
  if(!cardSettings.showTooltip){
    return;
  }

  hideTooltip(tooltip);
  activeTooltip = tooltip;

  tooltipTimeout = setTimeout(() => {
    tooltip.innerHTML = ''; // Clear existing content

    const imageContainer = document.createElement('div');
    imageContainer.className = 'tooltip-image-container';
    imageContainer.innerHTML = `<div class="loading">Loading...</div>`;
    tooltip.appendChild(imageContainer);

    const textContainer = document.createElement('div');
    textContainer.className = 'tooltip-text-container';
    tooltip.appendChild(textContainer);
    
    const printings = cardStore.getPrintings(card.name);
    if (printings.length > 1) {
        const currentIndex = printings.findIndex(p => p.id === card.id);
        const indicator = document.createElement('span');
        indicator.className = 'printing-indicator';
        indicator.textContent = `Version ${currentIndex + 1} of ${printings.length} (Right-click to cycle)`;
        textContainer.appendChild(indicator);
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
      console.debug('tooltip.addImage', { key, url, inCache: imageCache.has(key) });
      let img;
      if (imageCache.has(key)) {
        // clone the cached element (copy attributes)
        img = imageCache.get(key).cloneNode(true);
        // if the cloned image isn't loaded yet, reassign src to trigger a fetch if needed
        if (!img.complete && img.src) {
          const s = img.src;
          img.src = '';
          img.src = s;
        }
      } else {
        img = new Image();
        // force eager loading so we actually request the image even if it's not in the DOM yet
        img.loading = 'eager';
        img.decoding = 'async';
        img.alt = key;
        img.src = url;
        // cache the loaded image; errors/loads are handled below when we attach handlers
        img.onload = () => imageCache.set(key, img);
      }
      images.push(img);
    }

    // ---------------- Handle card images ----------------
    if (card.card_faces && multiLayouts.includes(card.layout) && card.card_faces.length === 2) {
        // MDFC's
        card.card_faces.forEach((face, index) => {
          let url = face?.image_uris?.normal;
          if (!url && face?.image_uris === undefined) {
            // sometimes Scryfall has image URL in "card_faces[index].image_uris" or "card_faces[index].normal"
            url = face?.normal;
          }
          if (url) {
            addImage(url, card.id + "-" + index);
          }
        });
    } else {
      // Normal single-faced card
      const url = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || card.card_faces?.[0]?.normal;
      if (url) addImage(url, card.id);
    }

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

  const isMobile = window.innerWidth <= 768;
  const maxTooltipHeight = window.innerHeight * (isMobile ? 0.7 : 0.6);
  const maxTooltipWidth = window.innerWidth * (isMobile ? 0.9 : 0.8);
  const imgWidth = Math.min(maxTooltipWidth / images.length, 300);

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
  tooltip.style.display = "none";
  activeTooltip = null;
  tooltip.innerHTML = "";
}

// ---------------- Position Tooltip ----------------
export function positionTooltip(e, tooltip) {
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