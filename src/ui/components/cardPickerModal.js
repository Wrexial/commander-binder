// src/ui/components/cardPickerModal.js
/**
 * A single-card picker for the Binder Builder. Unlike `cardNameInput` (a bulk
 * textarea), this is a search box with a short result list; picking a name
 * resolves its display printing (the user's pinned art, else the cheapest) and
 * hands the card back to the caller.
 */
import { cardStore } from '../../state/cardStore.js';
import { resolveDisplayPrinting } from '../../state/preferredPrintings.js';
import { getDisplayedPrice, formatPrice } from '../../utils/prices.js';
import { escapeHtml } from '../../utils/html.js';
import { createModal } from './modal.js';

const MAX_RESULTS = 30;

/** One pass over the store: lowercase name -> representative card. */
let indexCache = null;

function getNameIndex() {
  if (indexCache) return indexCache;
  indexCache = new Map();
  for (const card of cardStore.getAll()) {
    const key = card.name.toLowerCase();
    if (!indexCache.has(key)) indexCache.set(key, card);
  }
  return indexCache;
}

/** Invalidate the cached name index (tests / store reloads). */
export function resetCardPickerIndex() {
  indexCache = null;
}

/** Rank matches: prefix first, then word-start, then substring. */
export function rankCardNames(cards, query, limit = MAX_RESULTS) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const startsWith = [];
  const wordStart = [];
  const contains = [];

  for (const card of cards) {
    const lower = card.name.toLowerCase();
    if (lower.startsWith(q)) startsWith.push(card);
    else if (lower.split(/[\s,]+/).some((word) => word.startsWith(q))) wordStart.push(card);
    else if (lower.includes(q)) contains.push(card);
  }

  return [...startsWith, ...wordStart, ...contains].slice(0, limit);
}

/**
 * Build the picker modal.
 *
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {(card: object) => void} [options.onPick]
 * @returns {{show: (config?: {title?: string, showRemove?: boolean}) => void, close: () => void, destroy: () => void}}
 */
export function createCardPickerModal({ title = 'Add a card', onPick, onRemove } = {}) {
  const {
    modal,
    show: showShell,
    close,
  } = createModal({
    className: 'card-picker',
    ariaLabel: title,
  });

  const heading = document.createElement('h2');
  heading.className = 'card-picker-title';
  heading.textContent = title;

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'card-picker-search';
  searchInput.placeholder = 'Search card names…';
  searchInput.setAttribute('aria-label', 'Search card names');
  searchInput.autocomplete = 'off';

  const results = document.createElement('div');
  results.className = 'card-picker-results';
  results.setAttribute('role', 'listbox');

  const footer = document.createElement('div');
  footer.className = 'modal-button-container';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'danger card-picker-remove';
  removeButton.textContent = 'Remove card';
  removeButton.hidden = true;
  removeButton.addEventListener('click', () => {
    onRemove?.();
    close();
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', close);

  footer.append(removeButton, closeButton);
  modal.append(heading, searchInput, results, footer);

  function renderResults() {
    const index = getNameIndex();
    const matches = rankCardNames([...index.values()], searchInput.value);

    if (searchInput.value.trim().length < 2) {
      results.innerHTML =
        '<p class="card-picker-empty">Type at least two letters to search the collection.</p>';
      return;
    }
    if (matches.length === 0) {
      results.innerHTML = '<p class="card-picker-empty">No matching cards found.</p>';
      return;
    }

    results.innerHTML = '';
    for (const card of matches) {
      const display = resolveDisplayPrinting(card.name) || card;
      const price = getDisplayedPrice(display);

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'card-picker-result';
      row.setAttribute('role', 'option');
      row.innerHTML = `
        <span class="card-picker-name">${escapeHtml(card.name)}</span>
        <span class="card-picker-meta">
          <span class="card-picker-set">${escapeHtml((display.set || '').toUpperCase())}</span>
          ${price !== null ? `<span class="card-picker-price">${escapeHtml(formatPrice(price))}</span>` : ''}
        </span>`;
      row.addEventListener('click', () => {
        onPick?.(display);
        close();
      });
      results.appendChild(row);
    }
  }

  searchInput.addEventListener('input', renderResults);

  function show({ title: nextTitle, showRemove = false } = {}) {
    if (nextTitle) heading.textContent = nextTitle;
    removeButton.hidden = !showRemove;
    searchInput.value = '';
    renderResults();
    showShell();
    searchInput.focus();
  }

  return { show, close, destroy: close };
}
