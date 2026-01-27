// cards.js
import { cardSettings } from "../state/cardSettings.js";
import { appState } from "../state/appState.js";
import { isCardOwned } from "../state/cardState.js";
import { getCardBorderStyle, getCardBackground } from '../utils/colors.js';
import { CARDS_PER_PAGE } from '../config/constants.js';
import { cardStore } from '../state/cardStore.js';

export function createCardElement(card, cardIndex) {
  const div = document.createElement("div");
  div.className = "card loading";
  div.cardData = card;
  
    const slotNumberEl = document.createElement('span');
    slotNumberEl.className = 'card-slot-number';
    slotNumberEl.textContent = `#${(cardIndex % CARDS_PER_PAGE) + 1}`;
    slotNumberEl.style.display = 'block';
    div.appendChild(slotNumberEl);
  
    const nameEl = document.createElement('span');
    nameEl.className = 'card-name';
    nameEl.textContent = card.name;
    div.appendChild(nameEl);
  
    if (card.related_uris?.edhrec) {
      const edhrecBtn = document.createElement("a");
      edhrecBtn.className = "edhrec-link";
      edhrecBtn.href = card.related_uris.edhrec;
      edhrecBtn.target = "_blank";
      edhrecBtn.rel = "noopener noreferrer";
  
      const icon = document.createElement("img");
      icon.src = "/edhrec-icon.ico";
      icon.alt = "EDHREC";
  
      edhrecBtn.appendChild(icon);
      div.appendChild(edhrecBtn);
  
      // If user enabled persistent reveal, show the EDHREC link by default
      if (cardSettings.persistentReveal) {
        div.classList.add('reveal-links');
      }
    }
  
    const borderStyle = getCardBorderStyle(card);
    div.style.setProperty('--card-border', borderStyle.borderColor);
    div.style.setProperty('--card-bg', getCardBackground(card));
    div.style.setProperty('--card-text', '#111111');

    const printings = cardStore.getPrintings(card.name);
    const prices = printings.flatMap(p => [
        p.prices.eur,
        p.prices.eur_foil,
    ]).filter(p => p !== null).map(p => parseFloat(p));
    const price = prices.length > 0 ? Math.min(...prices) : null;

    if (price) {
        const priceEl = document.createElement('span');
        priceEl.className = 'card-price';
        priceEl.textContent = `€${price.toFixed(2)}`;
        div.appendChild(priceEl);
    }
  
    if (appState.isViewOnlyMode) {
      const ownedBadge = document.createElement('span');
      ownedBadge.className = 'owned-badge';
      ownedBadge.textContent = 'Owned';
      div.appendChild(ownedBadge);
      return div;
    }
  
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "card-toggle";
    // Toggle indicates whether you own the card (checkmark when owned)
      toggleBtn.title = isCardOwned(card) ? "Mark as missing" : "Mark as owned";
      toggleBtn.setAttribute('aria-label', isCardOwned(card) ? 'Mark as missing' : 'Mark as owned');
      toggleBtn.setAttribute('aria-pressed', (isCardOwned(card)).toString());
      // toggle button has no visible checkmark; owned state shown via badge
      toggleBtn.textContent = "";
  
      div.appendChild(toggleBtn);
  
      // Owned badge (hidden by default, shown when .owned class present)
      const ownedBadge = document.createElement('span');
      ownedBadge.className = 'owned-badge';
      ownedBadge.textContent = 'Owned';
      div.appendChild(ownedBadge);
  
      // Reserve space / keep layout stable when toggles exist
      div.classList.add('has-toggle');
    
        
    return div;
}

export function updateCardState(cardElement) {
    cardElement.classList.remove('loading');
    if (isCardOwned(cardElement.cardData)) {
        cardElement.classList.add('owned');
    }
}

export function updateCardStyles() {
  document.querySelectorAll('.card').forEach(div => {
    const card = div.cardData;
    if (!card) return;

    // Toggle EDHREC link visibility
    div.classList.toggle('reveal-links', cardSettings.persistentReveal);

    // Update styles based on settings
    const borderStyle = getCardBorderStyle(card);
    div.style.setProperty('--card-border', borderStyle.borderColor);
    div.style.setProperty('--card-bg', getCardBackground(card));
  });
}

export function updateAllCardStates() {
  document.querySelectorAll('.card').forEach(cardElement => {
    updateCardState(cardElement);
  });
}
