// cards.js
import { cardSettings } from '../state/cardSettings.js';
import { appState } from '../state/appState.js';
import { isCardOwned } from '../state/cardState.js';
import { getCardBorderStyle, getCardBackground } from '../utils/colors.js';
import { getCardImageUrls } from '../utils/cardImages.js';
import { getDisplayedPrice } from '../utils/prices.js';
import { CARDS_PER_PAGE } from '../config/constants.js';
import { cardStore } from '../state/cardStore.js';

/**
 * Which version of a card is currently shown, and how many exist. Delegates to
 * the store so the tile badge and the tooltip always agree (the store is also
 * the order right-click cycling walks through).
 * @param {object} card
 * @returns {{ index: number, total: number }}
 */
function getVersionInfo(card) {
  return cardStore.getPrintingPosition(card);
}

/**
 * Small badge reading "2/5 printings" (desktop) or "2/5" (mobile; the long
 * label is hidden by CSS).
 * @param {{index: number, total: number}} version
 * @returns {HTMLElement}
 */
function createVersionBadge({ index, total }) {
  const el = document.createElement('span');
  el.className = 'card-versions';
  el.title = `${total} printings`;
  el.setAttribute('aria-label', `${index} of ${total} printings`);

  const full = document.createElement('span');
  full.className = 'card-versions-full';
  full.textContent = `${index}/${total} printings`;

  const short = document.createElement('span');
  short.className = 'card-versions-short';
  short.textContent = `${index}/${total}`;

  el.append(full, short);
  return el;
}

/**
 * Build the tile's primary content: the card's name in text mode, or its
 * artwork in images mode. Falls back to the name when a card has no image.
 * @param {object} card
 * @returns {{el: HTMLElement, isImage: boolean}}
 */
function createCardMedia(card) {
  const urls = cardSettings.displayMode === 'images' ? getCardImageUrls(card) : null;

  if (!urls) {
    const nameEl = document.createElement('span');
    nameEl.className = 'card-name';
    nameEl.textContent = card.name;
    return { el: nameEl, isImage: false };
  }

  const img = document.createElement('img');
  img.className = 'card-image';
  img.setAttribute('loading', 'lazy');
  img.setAttribute('decoding', 'async');
  img.alt = card.name;
  img.width = 146;
  img.height = 204;

  // Phones stay on the tiny (~7 KB) WebP thumb; wider viewports load the
  // sharper grid art.
  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.media = '(min-width: 769px)';
  source.srcset = urls.grid;
  picture.appendChild(source);
  picture.appendChild(img);
  img.src = urls.thumb;

  return { el: picture, isImage: true };
}

/**
 * (Re)build a card element's contents in place for the current display mode.
 * State classes (`.loading`, `.owned`) are left untouched so this can be used
 * both for creation and for live re-renders (mode change, printing cycle).
 * @param {HTMLElement} div
 * @param {object} card
 * @param {number} cardIndex
 */
function populateCard(div, card, cardIndex) {
  div.replaceChildren();
  div.classList.remove('has-toggle', 'reveal-links', 'image-tile');

  const slotNumberEl = document.createElement('span');
  slotNumberEl.className = 'card-slot-number';
  slotNumberEl.textContent = `#${(cardIndex % CARDS_PER_PAGE) + 1}`;
  slotNumberEl.style.display = 'block';
  div.appendChild(slotNumberEl);

  const { el: mediaEl, isImage } = createCardMedia(card);
  if (isImage) div.classList.add('image-tile');
  div.appendChild(mediaEl);

  if (card.related_uris?.edhrec) {
    const edhrecBtn = document.createElement('a');
    edhrecBtn.className = 'edhrec-link';
    edhrecBtn.href = card.related_uris.edhrec;
    edhrecBtn.target = '_blank';
    edhrecBtn.rel = 'noopener noreferrer';
    // The icon is drawn by CSS (::after) instead of an <img>, removing one
    // image element per card from the DOM.
    edhrecBtn.setAttribute('aria-label', 'View on EDHREC');

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

  const price = getDisplayedPrice(card);

  if (price) {
    const priceEl = document.createElement('span');
    priceEl.className = 'card-price';
    priceEl.textContent = `€${price.toFixed(2)}`;
    div.appendChild(priceEl);
  }

  // Version badge: only shown when a card has more than one printing.
  const version = getVersionInfo(card);
  if (version.total > 1) {
    div.appendChild(createVersionBadge(version));
  }

  if (appState.isViewOnlyMode) {
    const ownedBadge = document.createElement('span');
    ownedBadge.className = 'owned-badge';
    ownedBadge.textContent = 'Owned';
    div.appendChild(ownedBadge);
    return;
  }

  const owned = isCardOwned(card);
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'card-toggle';
  // Toggle indicates whether you own the card (checkmark when owned)
  toggleBtn.title = owned ? 'Mark as missing' : 'Mark as owned';
  toggleBtn.setAttribute('aria-label', owned ? 'Mark as missing' : 'Mark as owned');
  toggleBtn.setAttribute('aria-pressed', owned.toString());
  // The visible +/tick is drawn by CSS on .card-toggle::after.
  toggleBtn.textContent = '';

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

export function createCardElement(card, cardIndex) {
  const div = document.createElement('div');
  div.className = 'card loading';
  div.cardData = card;
  populateCard(div, card, cardIndex);
  return div;
}

/** Re-render a single mounted card (e.g. after cycling its printing). */
export function refreshCardElement(cardElement) {
  if (!cardElement || !cardElement.cardData) return;
  const cardIndex = Number(cardElement.dataset.cardIndex) || 0;
  populateCard(cardElement, cardElement.cardData, cardIndex);
}

/** Re-render every mounted card, e.g. after the display mode changes. */
export function applyDisplayMode() {
  document.querySelectorAll('.card').forEach((cardElement) => {
    refreshCardElement(cardElement);
  });
}

export function updateCardState(cardElement) {
  cardElement.classList.remove('loading');
  if (isCardOwned(cardElement.cardData)) {
    cardElement.classList.add('owned');
  }
}

export function updateCardStyles() {
  document.querySelectorAll('.card').forEach((div) => {
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
  document.querySelectorAll('.card').forEach((cardElement) => {
    updateCardState(cardElement);
  });
}

/** Refresh the version badge on every mounted card once all printings load. */
export function updateCardVersionCounts() {
  document.querySelectorAll('.card').forEach((cardElement) => {
    const card = cardElement.cardData;
    if (!card) return;

    const version = getVersionInfo(card);
    let badge = cardElement.querySelector('.card-versions');

    if (version.total <= 1) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      cardElement.appendChild(createVersionBadge(version));
      return;
    }

    badge.querySelector('.card-versions-full').textContent =
      `${version.index}/${version.total} printings`;
    badge.querySelector('.card-versions-short').textContent = `${version.index}/${version.total}`;
    badge.title = `${version.total} printings`;
    badge.setAttribute('aria-label', `${version.index} of ${version.total} printings`);
  });
}
