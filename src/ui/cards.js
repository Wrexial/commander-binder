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
 * Native browser tooltip hint shown on mouse-driven (PC) layouts, where the
 * custom hover preview is disabled. Right-click cycling is otherwise invisible.
 */
const NEXT_PRINTING_HINT = 'Right-click for next printing';

/**
 * Apply/remove the native right-click hint on a tile and its media element.
 * @param {HTMLElement} cardElement
 * @param {HTMLElement|null} mediaEl
 * @param {boolean} enabled
 */
function applyNextPrintingHint(cardElement, mediaEl, enabled) {
  if (enabled) {
    cardElement.title = NEXT_PRINTING_HINT;
    if (mediaEl) mediaEl.title = NEXT_PRINTING_HINT;
  } else {
    cardElement.removeAttribute('title');
    if (mediaEl) mediaEl.removeAttribute('title');
  }
}

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
  el.title = `${total} printings — ${NEXT_PRINTING_HINT.toLowerCase()}`;
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
 * EDHREC link for a tile. The icon is drawn in CSS (::after) so no extra
 * <img> is added to the DOM per card.
 * @param {object} card
 * @returns {HTMLAnchorElement|null}
 */
function createEdhrecLink(card) {
  if (!card.related_uris?.edhrec) return null;

  const link = document.createElement('a');
  link.className = 'edhrec-link';
  link.href = card.related_uris.edhrec;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'View on EDHREC');
  return link;
}

/** Price pill shared by text tiles and the image-tile footer. */
function createPriceElement(price) {
  const el = document.createElement('span');
  el.className = 'card-price';
  el.textContent = `€${price.toFixed(2)}`;
  return el;
}

/** "Owned" badge shown in view-only shares and next to the tile toggle. */
function createOwnedBadge() {
  const badge = document.createElement('span');
  badge.className = 'owned-badge';
  badge.textContent = 'Owned';
  return badge;
}

/**
 * Accessible name for the ownership toggle. Shared by every code path so the
 * class, the aria state and the tooltip can never disagree.
 * @param {boolean} owned
 */
function ownedToggleLabel(owned) {
  return owned ? 'Mark as missing' : 'Mark as owned';
}

/**
 * Point a tile's toggle button at the current ownership state.
 * @param {HTMLElement} cardElement
 * @param {boolean} owned
 */
function syncOwnedToggle(cardElement, owned) {
  const toggle = cardElement.querySelector('.card-toggle');
  if (!toggle) return;

  toggle.setAttribute('aria-pressed', String(owned));
  toggle.setAttribute('aria-label', ownedToggleLabel(owned));
  toggle.title = ownedToggleLabel(owned);
}

/**
 * Reflect ownership on a tile: the `owned` class (which paints the tick) plus
 * the toggle's accessible state.
 * @param {HTMLElement} cardElement
 * @param {boolean} owned
 */
export function syncCardOwnedUi(cardElement, owned) {
  cardElement.classList.toggle('owned', owned);
  syncOwnedToggle(cardElement, owned);
}

/**
 * Ownership toggle. The visible +/tick is drawn by CSS on
 * `.card-toggle::after`/`.card.owned .card-toggle::after`.
 * @param {boolean} owned
 * @returns {HTMLButtonElement}
 */
function createOwnedToggle(owned) {
  const toggle = document.createElement('button');
  toggle.className = 'card-toggle';
  toggle.title = ownedToggleLabel(owned);
  toggle.setAttribute('aria-label', ownedToggleLabel(owned));
  toggle.setAttribute('aria-pressed', owned.toString());
  toggle.textContent = '';
  return toggle;
}

/**
 * Compact (~26px) details strip pinned to the bottom of an image tile. It
 * replaces the old tooltip text footer and gathers the name, set/number and
 * price together with the printing count, EDHREC link and owned control.
 * @param {object} card
 * @param {number|null} price
 * @param {{index: number, total: number}} version
 * @returns {HTMLElement}
 */
function createCardFooter(card, price, version) {
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const main = document.createElement('div');
  main.className = 'card-footer-main';

  const name = document.createElement('span');
  name.className = 'card-footer-name';
  name.textContent = card.name;
  main.appendChild(name);

  const meta = document.createElement('span');
  meta.className = 'card-footer-meta';

  if (card.set_name) {
    const setEl = document.createElement('span');
    setEl.className = 'card-footer-set';
    setEl.textContent = card.set_name;
    meta.appendChild(setEl);
  }

  if (card.collector_number) {
    const numEl = document.createElement('span');
    numEl.className = 'card-footer-num';
    numEl.textContent = `#${card.collector_number}`;
    meta.appendChild(numEl);
  }
  if (meta.childNodes.length > 0) main.appendChild(meta);

  if (price !== null) main.appendChild(createPriceElement(price));

  footer.appendChild(main);

  const actions = document.createElement('div');
  actions.className = 'card-footer-actions';

  // Version badge: only shown when a card has more than one printing.
  if (version.total > 1) actions.appendChild(createVersionBadge(version));

  const edhrec = createEdhrecLink(card);
  if (edhrec) actions.appendChild(edhrec);

  actions.appendChild(
    appState.isViewOnlyMode ? createOwnedBadge() : createOwnedToggle(isCardOwned(card))
  );
  footer.appendChild(actions);

  return footer;
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
  div.classList.remove('has-toggle', 'image-tile');

  const slotNumberEl = document.createElement('span');
  slotNumberEl.className = 'card-slot-number';
  slotNumberEl.textContent = `#${(cardIndex % CARDS_PER_PAGE) + 1}`;
  slotNumberEl.style.display = 'block';
  div.appendChild(slotNumberEl);

  const { el: mediaEl, isImage } = createCardMedia(card);
  if (isImage) div.classList.add('image-tile');
  div.appendChild(mediaEl);

  const borderStyle = getCardBorderStyle(card);
  div.style.setProperty('--card-border', borderStyle.borderColor);
  div.style.setProperty('--card-bg', getCardBackground(card));
  div.style.setProperty('--card-text', '#111111');

  const price = getDisplayedPrice(card);
  // Version badge: only shown when a card has more than one printing.
  const version = getVersionInfo(card);

  // Discoverability for right-click cycling on PC (native title tooltip; touch
  // devices never render it). Set it on the media element too so hovering the
  // artwork (which fills the tile) shows the hint rather than the image alt.
  applyNextPrintingHint(div, mediaEl, version.total > 1);

  // Image tiles gather everything into a single footer strip so the artwork
  // stays legible instead of carrying half a dozen floating badges.
  if (isImage) {
    div.appendChild(createCardFooter(card, price, version));
    if (!appState.isViewOnlyMode) div.classList.add('has-toggle');
    return div;
  }

  const edhrec = createEdhrecLink(card);
  if (edhrec) div.appendChild(edhrec);

  if (price !== null) div.appendChild(createPriceElement(price));
  if (version.total > 1) div.appendChild(createVersionBadge(version));

  if (appState.isViewOnlyMode) {
    div.appendChild(createOwnedBadge());
    return div;
  }

  div.appendChild(createOwnedToggle(isCardOwned(card)));
  div.appendChild(createOwnedBadge());

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

  const owned = isCardOwned(cardElement.cardData);
  // Additive on purpose: owned cards may be toggled while the saved state is
  // still loading, and this pass must not undo that.
  if (owned) cardElement.classList.add('owned');
  syncOwnedToggle(cardElement, owned);
}

export function updateCardStyles() {
  document.querySelectorAll('.card').forEach((div) => {
    const card = div.cardData;
    if (!card) return;

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

    const mediaEl = cardElement.querySelector('.card-image, .card-name');

    if (version.total <= 1) {
      if (badge) badge.remove();
      applyNextPrintingHint(cardElement, mediaEl, false);
      return;
    }

    applyNextPrintingHint(cardElement, mediaEl, true);

    if (!badge) {
      const newBadge = createVersionBadge(version);
      // Image tiles host the badge at the front of their footer action group.
      const actions = cardElement.querySelector('.card-footer-actions');
      if (actions) {
        actions.prepend(newBadge);
      } else {
        cardElement.appendChild(newBadge);
      }
      return;
    }

    badge.querySelector('.card-versions-full').textContent =
      `${version.index}/${version.total} printings`;
    badge.querySelector('.card-versions-short').textContent = `${version.index}/${version.total}`;
    badge.title = `${version.total} printings — ${NEXT_PRINTING_HINT.toLowerCase()}`;
    badge.setAttribute('aria-label', `${version.index} of ${version.total} printings`);
  });
}
