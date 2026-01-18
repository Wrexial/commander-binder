// cards.js
import { cardSettings } from "./cardSettings.js";
import { appState } from "./appState.js";
import { isCardMissing } from "./cardState.js";
import { getCardBorderStyle, getCardBackground } from './utils/colors.js';
import { CARDS_PER_PAGE } from './config.js';
import { cardStore } from "./loadedCards.js";


export function createCardElement(card, cardIndex) {
  cardStore.add(card);
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
      toggleBtn.title = !isCardMissing(card) ? "Mark as missing" : "Mark as owned";
      toggleBtn.setAttribute('aria-label', !isCardMissing(card) ? 'Mark as missing' : 'Mark as owned');
      toggleBtn.setAttribute('aria-pressed', (!isCardMissing(card)).toString());
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
    if (!isCardMissing(cardElement.cardData)) {
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

