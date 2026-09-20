// src/ui/components/printingPickerModal.js
/**
 * A scrollable list of every printing of a card, used to choose the exact
 * version a Binder Builder pocket shows. Cycling (right-click / the version
 * badge) is fine for a couple of printings, but a common card can have dozens,
 * so this modal lists them all with set, collector number, year and price, plus
 * a filter for finding a set by code or name.
 */
import { getCardImageUrls } from '../../utils/cardImages.js';
import { getDisplayedPrice, formatPrice } from '../../utils/prices.js';
import { orderPrintingsByPrice } from '../../utils/printings.js';
import { cardStore } from '../../state/cardStore.js';
import { createModal } from './modal.js';

/** "CMM · Commander Masters" (falls back to just the code). */
function setLabel(printing) {
  const code = (printing.set || '').toUpperCase();
  const name = printing.set_name || '';
  return name ? `${code} · ${name}` : code;
}

/** The release year, or '' when unknown. */
function releaseYear(printing) {
  const date = printing.released_at;
  return typeof date === 'string' && date.length >= 4 ? date.slice(0, 4) : '';
}

/** Everything the set filter searches: code, name, collector number and year. */
function searchText(printing) {
  return [printing.set, printing.set_name, printing.collector_number, releaseYear(printing)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** True when every whitespace-separated term appears in the printing's text. */
function matchesQuery(printing, query) {
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchText(printing);
  return terms.every((term) => haystack.includes(term));
}

/**
 * Build the printing picker.
 *
 * @param {object} config
 * @param {object} config.card The card whose printings are listed (for the title).
 * @param {object[]} config.printings Every known printing, in display order.
 * @param {string} [config.currentId] The currently shown printing id.
 * @param {(printing: object) => void} config.onPick
 * @returns {{show: () => void, close: () => void, destroy: () => void}}
 */
export function createPrintingPickerModal({ card, printings, currentId, onPick }) {
  const {
    modal,
    show: showShell,
    close,
  } = createModal({
    className: 'printing-picker',
    ariaLabel: 'Select printing',
  });

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';

  const heading = document.createElement('h2');
  heading.textContent = 'Select printing';

  const subtitle = document.createElement('p');
  subtitle.className = 'bulk-modal-subtitle';
  subtitle.textContent = `${card?.name || 'Card'} — ${printings.length} printing${
    printings.length === 1 ? '' : 's'
  }`;

  header.append(heading, subtitle);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'printing-picker-search';
  searchInput.placeholder = 'Filter by set code or set name…';
  searchInput.setAttribute('aria-label', 'Filter printings by set');
  searchInput.autocomplete = 'off';

  const list = document.createElement('div');
  list.className = 'printing-picker-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Printings');

  function buildRow(printing) {
    const isCurrent = printing.id === currentId;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = `printing-picker-row${isCurrent ? ' is-current' : ''}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(isCurrent));

    const thumb = document.createElement('span');
    thumb.className = 'printing-picker-thumb';
    const urls = getCardImageUrls(printing);
    if (urls) {
      const img = document.createElement('img');
      // The sharper `grid` art reads well at the larger preview size; lazy
      // loading keeps a long list of printings cheap.
      img.src = urls.grid || urls.thumb;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      thumb.appendChild(img);
    }

    const info = document.createElement('span');
    info.className = 'printing-picker-info';

    const setEl = document.createElement('span');
    setEl.className = 'printing-picker-set';
    setEl.textContent = setLabel(printing);

    const meta = document.createElement('span');
    meta.className = 'printing-picker-meta';
    const bits = [];
    if (printing.collector_number) bits.push(`#${printing.collector_number}`);
    const year = releaseYear(printing);
    if (year) bits.push(year);
    const price = getDisplayedPrice(printing);
    if (price !== null) bits.push(formatPrice(price));
    meta.textContent = bits.join(' · ');

    info.append(setEl, meta);

    const check = document.createElement('span');
    check.className = 'printing-picker-check';
    check.textContent = isCurrent ? '✓' : '';

    row.append(thumb, info, check);
    row.addEventListener('click', () => {
      onPick?.(printing);
      close();
    });

    return row;
  }

  /** Filter the printings by the current query and rebuild the list. */
  function renderRows() {
    const query = searchInput.value.trim().toLowerCase();
    const matches = printings.filter((printing) => matchesQuery(printing, query));

    list.replaceChildren();

    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'printing-picker-empty';
      empty.textContent = 'No printings match that set.';
      list.appendChild(empty);
      return;
    }

    for (const printing of matches) list.appendChild(buildRow(printing));
  }

  const footer = document.createElement('div');
  footer.className = 'modal-button-container';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', close);
  footer.appendChild(closeButton);

  searchInput.addEventListener('input', renderRows);

  modal.append(header, searchInput, list, footer);
  renderRows();

  return {
    show: () => {
      showShell();
      searchInput.focus();
      // Bring the pocket's current printing into view for a long list.
      const current = list.querySelector('.printing-picker-row.is-current');
      if (current && typeof current.scrollIntoView === 'function') {
        current.scrollIntoView({ block: 'center' });
      }
    },
    close,
    destroy: close,
  };
}

/**
 * Open the printing picker for a card, listing every known printing of its
 * name. This is the single "change printing" affordance for the grid, the
 * preview and the statistics hover preview (no more next/previous cycling).
 *
 * @param {object} config
 * @param {object} config.card The currently shown printing.
 * @param {string} [config.currentId] Printing id to mark as current (defaults to `card.id`).
 * @param {(printing: object) => void} config.onPick
 * @returns {{show: () => void, close: () => void, destroy: () => void} | null}
 *   null when the card has no alternative printing.
 */
export function openPrintingPicker({ card, currentId, onPick }) {
  if (!card?.name) return null;

  const printings = orderPrintingsByPrice(cardStore.getPrintings(card.name));
  if (printings.length <= 1) return null;

  const picker = createPrintingPickerModal({
    card,
    printings,
    currentId: currentId || card.id,
    onPick,
  });
  picker.show();
  return picker;
}
