// cards.js
import { showTooltip, hideTooltip, positionTooltip } from './tooltip.js';
import { cardSettings } from "./cardSettings.js";
import {state} from "./state.js";
import { isCardEnabled, toggleCardEnabled } from "./cardState.js";
import {loggedInUserId} from './main.js';
import { getCardBorderStyle, getCardBackground } from './utils/colors.js';


export function createCardElement(card) {
  const div = document.createElement("div");
  div.className = "card";
  div.textContent = card.name;

  if (cardSettings.showEdhrecLink && card.related_uris?.edhrec) {
    const edhrecBtn = document.createElement("a");
    edhrecBtn.className = "edhrec-link";
    edhrecBtn.href = card.related_uris.edhrec;
    edhrecBtn.target = "_blank";
    edhrecBtn.rel = "noopener noreferrer";

    const icon = document.createElement("img");
    icon.src = "https://edhrec.com/favicon.ico";
    icon.alt = "EDHREC";

    edhrecBtn.appendChild(icon);
    div.appendChild(edhrecBtn);
  }

  if (cardSettings.showColors) {
    const borderStyle = getCardBorderStyle(card);
    div.style.setProperty('--card-border', borderStyle.borderColor);
    div.style.setProperty('--card-bg', getCardBackground(card));
    // Colored cards use a dark text color for legibility even in dark mode
    div.style.setProperty('--card-text', '#111111');
  } else {
    div.style.setProperty('--card-border', 'var(--card-border-default)');
    div.style.setProperty('--card-bg', 'var(--card-bg-default)');
    div.style.removeProperty('--card-text');
  }

  if(cardSettings.showDisabledCards){
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "card-toggle";
    toggleBtn.title = "Enable / Disable card";
    toggleBtn.textContent = isCardEnabled(card) ? "⛔" : "";

    if (!isCardEnabled(card)) {
      div.classList.add("disabled");
    }

    div.appendChild(toggleBtn);
    if (toggleBtn.textContent && toggleBtn.textContent.trim()) {
      div.classList.add('has-toggle');
    }
  }

  return div;
}

export function attachCardHandlers(div, card, tooltip) {
  let pressTimer;

  if (cardSettings.showTooltip) {
    div.addEventListener("mouseenter", (e)=>{
      if (!isCardEnabled(card)) return;
      showTooltip(e, card, tooltip);
    });

    div.addEventListener("mousemove", e =>{
      if (!isCardEnabled(card)) return;
      positionTooltip(e, tooltip);
    });

    div.addEventListener("mouseleave", () =>{
      if (!isCardEnabled(card)) return;
      hideTooltip(tooltip);
    });
  }

  const edhrecBtn = div.querySelector('.edhrec-link');
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (edhrecBtn) {
    // On touch devices, require a long-press on the card to reveal the link.
    // When revealed, the link becomes tappable for a short window.
    if (isTouch) {
      let revealTimer;
      let hideTimer;
      let suppressUntil = 0; // timestamp until which card click/toggle is suppressed after a long-press

      const startReveal = (e) => {
        // start long-press timer to reveal
        clearTimeout(revealTimer);
        revealTimer = setTimeout(() => {
          div.classList.add('reveal-links');
          suppressUntil = Date.now() + 650; // suppress clicks/toggles briefly

          // show tooltip at the touch point if enabled and card is enabled
          if (cardSettings.showTooltip && isCardEnabled(card)) {
            try {
              const touch = e.touches && e.touches[0] ? e.touches[0] : e;
              const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
              showTooltip(fakeEvent, card, tooltip);
            } catch (err) {
              // ignore
            }
          }

          // auto-hide after a bit and hide tooltip as well
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            div.classList.remove('reveal-links');
            hideTooltip(tooltip);
          }, 1500);
        }, 350);
      };

      const cancelReveal = () => {
        clearTimeout(revealTimer);
      };

      div.addEventListener('touchstart', startReveal, { passive: true });
      div.addEventListener('touchmove', cancelReveal, { passive: true });
      div.addEventListener('touchend', cancelReveal, { passive: true });

      // If user taps the EDHREC icon, reveal it on first tap (prevent navigation), allow navigation on second tap
      edhrecBtn.addEventListener('touchstart', (ev) => {
        if (!div.classList.contains('reveal-links')) {
          // reveal and prevent the navigation on the first tap
          ev.preventDefault();
          ev.stopPropagation();
          clearTimeout(hideTimer);
          div.classList.add('reveal-links');
          suppressUntil = Date.now() + 650;
          hideTimer = setTimeout(() => {
            div.classList.remove('reveal-links');
            hideTooltip(tooltip);
          }, 1500);
        }
        // if already revealed, allow the tap through
      }, { passive: false });

      // Prevent native context menu (long-press) on touch devices for EDHREC link and card
      edhrecBtn.addEventListener('contextmenu', (ev) => {
        if (isTouch) ev.preventDefault();
      });
      div.addEventListener('contextmenu', (ev) => {
        if (isTouch) ev.preventDefault();
      });

      // Also guard click events for safety
      edhrecBtn.addEventListener('click', (ev) => {
        if (!div.classList.contains('reveal-links')) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        // else allow default navigation
      });

      // expose suppressUntil for outer click handler
      div._suppressToggleUntil = () => suppressUntil;
    } else {
      // Non-touch devices keep small press-to-open convenience
      edhrecBtn.addEventListener("touchstart", e => {
        pressTimer = setTimeout(() => {
          window.open(edhrecBtn.href, "_blank", "noopener");
        }, 500);
      });

      edhrecBtn.addEventListener("touchend", () => {
        clearTimeout(pressTimer);
      });
    }
  }

  div.addEventListener("click", async e => {
    if (e.target.closest(".edhrec-link")) return;
    if (!cardSettings.showDisabledCards) return;

    // On touch devices, suppress click actions briefly after a long-press reveal
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) {
      const suppressUntil = typeof div._suppressToggleUntil === 'function' ? div._suppressToggleUntil() : 0;
      if (suppressUntil && Date.now() < suppressUntil) {
        // ignore this click (it likely came from the long-press gesture)
        return;
      }
    }

    e.stopPropagation();
    const enabled = await toggleCardEnabled(card);
    div.classList.toggle("disabled", !enabled);

    const toggleBtn = div.querySelector('.card-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = enabled ? "⛔" : "";
      if (toggleBtn.textContent && toggleBtn.textContent.trim()) {
        div.classList.add('has-toggle');
      } else {
        div.classList.remove('has-toggle');
      }
    }

    enabled && cardSettings.showTooltip ? showTooltip(e, card, tooltip) : hideTooltip(tooltip);
  });
}