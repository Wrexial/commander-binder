// src/ui/components/cardPickerModal.js
/**
 * A single-card picker for the Binder Builder. A binder can hold any card, so
 * the search uses Scryfall's autocomplete catalog (live, rate-limited and
 * cached by `scryfall.js`) rather than the legendary-creature bulk set the
 * browse grid uses. Already-loaded cards are matched locally first for instant
 * feedback; the live results are merged in when they arrive.
 *
 * Picking a name loads its printings into `cardStore` and hands the display
 * printing (the saved art, else the cheapest) back to the caller.
 */
import { cardStore } from '../../state/cardStore.js';
import { resolveDisplayPrinting } from '../../state/preferredPrintings.js';
import { isCardCatalogLoaded, rankCatalogNames } from '../../state/cardCatalog.js';
import {
  autocompleteCardNames,
  ensurePrintingsLoaded,
  loadPrintingsForName,
} from '../../api/cardSearch.js';
import { getDisplayedPrice, formatPrice } from '../../utils/prices.js';
import { debounce } from '../../utils/debounce.js';
import { escapeHtml } from '../../utils/html.js';
import { createModal } from './modal.js';

const MAX_RESULTS = 30;
const SEARCH_DEBOUNCE_MS = 250;

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
 * @param {() => void} [options.onRemove]
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
  searchInput.placeholder = 'Search any card by name…';
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

  /** Discards a live search whose query has already been superseded. */
  let requestToken = 0;
  let choosing = false;

  function localNames(query) {
    if (query.trim().length < 2) return [];
    // Prefer the all-cards catalog (every name, no network); fall back to the
    // cards already loaded in the store while the catalog is still streaming.
    const fromCatalog = rankCatalogNames(query, MAX_RESULTS);
    if (fromCatalog.length > 0) return fromCatalog;
    return rankCardNames(cardStore.getAll(), query).map((card) => card.name);
  }

  function renderMessage(text) {
    results.innerHTML = '';
    const message = document.createElement('p');
    message.className = 'card-picker-empty';
    message.textContent = text;
    results.appendChild(message);
  }

  function renderRows(names) {
    if (names.length === 0) {
      renderMessage('No matching cards found.');
      return;
    }

    results.innerHTML = '';
    for (const name of names) {
      const local = cardStore.getPrintings(name)[0];
      const display = local ? resolveDisplayPrinting(name) || local : null;
      const price = display ? getDisplayedPrice(display) : null;

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'card-picker-result';
      row.setAttribute('role', 'option');
      row.innerHTML = `
        <span class="card-picker-name">${escapeHtml(name)}</span>
        <span class="card-picker-meta">
          ${display?.set ? `<span class="card-picker-set">${escapeHtml(display.set.toUpperCase())}</span>` : ''}
          ${price !== null ? `<span class="card-picker-price">${escapeHtml(formatPrice(price))}</span>` : ''}
        </span>`;
      row.addEventListener('click', () => choose(name));
      results.appendChild(row);
    }
  }

  /** Load the card's printings, then hand back its display printing. */
  async function choose(name) {
    if (choosing) return;
    choosing = true;
    renderMessage('Loading…');

    try {
      if (cardStore.getPrintings(name).length === 0) {
        await loadPrintingsForName(name);
      } else {
        // Refresh the printing list in the background so cycling works.
        ensurePrintingsLoaded(name);
      }
    } catch (err) {
      console.error('Failed to load the card:', err);
    }

    const display = resolveDisplayPrinting(name) || cardStore.getPrintings(name)[0];
    choosing = false;
    if (!display) {
      renderMessage('Could not load that card. Check your connection and try again.');
      return;
    }

    onPick?.(display);
    close();
  }

  const runLiveSearch = debounce(async (query, token) => {
    let names = [];
    try {
      names = await autocompleteCardNames(query);
    } catch (err) {
      console.error('Card search failed:', err);
      return;
    }
    if (token !== requestToken) return;

    const merged = [...new Set([...localNames(query), ...names])].slice(0, MAX_RESULTS);
    renderRows(merged);
  }, SEARCH_DEBOUNCE_MS);

  searchInput.addEventListener('input', () => {
    const query = searchInput.value;
    const token = ++requestToken;

    if (query.trim().length < 2) {
      renderMessage('Type at least two letters to search all cards.');
      return;
    }

    const local = localNames(query);
    if (local.length > 0) renderRows(local);
    else renderMessage('Searching…');

    // Once the all-cards catalog is loaded it can answer every query itself,
    // so only hit the network while it is still unavailable.
    if (!isCardCatalogLoaded()) runLiveSearch(query, token);
  });

  function show({ title: nextTitle, showRemove = false } = {}) {
    if (nextTitle) heading.textContent = nextTitle;
    removeButton.hidden = !showRemove;
    searchInput.value = '';
    requestToken += 1;
    renderMessage('Type at least two letters to search all cards.');
    showShell();
    searchInput.focus();
  }

  return { show, close, destroy: close };
}
