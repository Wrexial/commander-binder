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
  if (edhrecBtn) {
    edhrecBtn.addEventListener("touchstart", e => {
      pressTimer = setTimeout(() => {
        window.open(edhrecBtn.href, "_blank", "noopener");
      }, 500);
    });

    edhrecBtn.addEventListener("touchend", () => {
      clearTimeout(pressTimer);
    });
  }

  div.addEventListener("click", async e => {
    if (e.target.closest(".edhrec-link")) return;
    if (!cardSettings.showDisabledCards) return;

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