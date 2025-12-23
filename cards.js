// cards.js
import { showTooltip, hideTooltip, positionTooltip } from './tooltip.js';
import { cardSettings } from "./cardSettings.js";
import {state} from "./state.js";
import { isCardEnabled, toggleCardEnabled } from "./cardState.js";
import {loggedInUserId} from './main.js';


const mtgColorMap = {
  "W": "#f8f3e0", // White
  "U": "#4c8cc8", // Blue
  "B": "#333333", // Black
  "R": "#c84c4c", // Red
  "G": "#4cc88c"  // Green
};

const colorlessColor = "#aaaaaa"; // Gray
const multicolorBorderColor = "#FFD700"; // Gold for multicolor

const mtgBgMap = {
  "W": "#fdf8ec", // very light cream
  "U": "#e3f0fa", // light blue
  "B": "#e5e5e5", // light gray for black
  "R": "#fde3e3", // light red
  "G": "#e3f9ef"  // light green
};

const colorlessBg = "#f4f4f4";   // neutral gray

/**
 * Returns border color or gradient for a card, prioritizing commander identity
 */
function getCardBorderStyle(card) {
  const colors = card.color_identity || [];

  if (colors.length === 0) {
    return { borderColor: colorlessColor };
  }

  if (colors.length === 1) {
    return { borderColor: mtgColorMap[colors[0]] || colorlessColor };
  }

  // Multicolor
  return { borderColor: multicolorBorderColor };
}

function getCardBackground(card) {
  const colors = card.color_identity || [];

  if (colors.length === 0) return colorlessBg;
  if (colors.length === 1) return mtgBgMap[colors[0]] || colorlessBg;

  // Multicolor: vertical stripes
  const percentStep = 100 / colors.length;
  let gradientStops = [];

  colors.forEach((c, i) => {
    const color = mtgBgMap[c] || colorlessBg;
    const start = i * percentStep;
    const end = (i + 1) * percentStep;
    gradientStops.push(`${color} ${start}%`, `${color} ${end}%`);
  });

  return `linear-gradient(to right, ${gradientStops.join(", ")})`;
}

export function createCardElement(card, tooltip) {
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
    edhrecBtn.addEventListener("touchstart", e => {
      pressTimer = setTimeout(() => {
        window.open(edhrecBtn.href, "_blank", "noopener");
      }, 500);
    });

    edhrecBtn.addEventListener("touchend", () => {
      clearTimeout(pressTimer);
    });
}

  if (cardSettings.showColors) {
    const borderStyle = getCardBorderStyle(card);
    div.style.border = `2px solid ${borderStyle.borderColor}`;
    div.style.background = getCardBackground(card);
  } else {
    div.style.border = "1px solid #ccc";
    div.style.background = "#fff";
  }

  if (cardSettings.showTooltip) {
      div.addEventListener("mouseenter", (e)=>{      
      if (!isCardEnabled(card)) return;
        showTooltip(e, card, tooltip)
    }  );
    
    div.addEventListener("mousemove", e =>{
      
      if (!isCardEnabled(card)) return;
          positionTooltip(e, tooltip)
    });
    div.addEventListener("mouseleave", () =>{
      if (!isCardEnabled(card)) return;
      hideTooltip(tooltip)
    });
  }

  div.addEventListener("click", e => {
    if (e.target.closest(".edhrec-link")) return;
  });
  
  if(cardSettings.showDisabledCards){
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "card-toggle";
    toggleBtn.title = "Enable / Disable card";
    toggleBtn.textContent = isCardEnabled(card) ? "⛔" : "";

    div.addEventListener("click", async e => {
      e.stopPropagation();
      const enabled = await toggleCardEnabled(card);
      div.classList.toggle("disabled", !enabled);
      toggleBtn.textContent = enabled ? "⛔" : "";
      enabled && cardSettings.showTooltip ? showTooltip(e, card, tooltip) : hideTooltip(tooltip);
    });
    
    if (!isCardEnabled(card)) {
      div.classList.add("disabled");
    }

    div.appendChild(toggleBtn);
  }

  return div;
}