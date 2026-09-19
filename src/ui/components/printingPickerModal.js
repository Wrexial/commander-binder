// src/ui/components/printingPickerModal.js
/**
 * A scrollable list of every printing of a card, used to choose the exact
 * version a Binder Builder pocket shows. Cycling (right-click / the version
 * badge) is fine for a couple of printings, but a common card can have dozens,
 * so this modal lists them all with set, collector number, year and price.
 */
import { getCardImageUrls } from '../../utils/cardImages.js';
import { getDisplayedPrice, formatPrice } from '../../utils/prices.js';
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
  const { modal, show, close } = createModal({
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
  modal.appendChild(header);

  const list = document.createElement('div');
  list.className = 'printing-picker-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Printings');

  for (const printing of printings) {
    const isCurrent = printing.id === currentId;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = `printing-picker-row${isCurrent ? ' is-current' : ''}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(isCurrent));

    const thumb = document.createElement('span');
    thumb.className = 'printing-picker-thumb';
    const urls = getCardImageUrls(printing);
    if (urls?.thumb) {
      const img = document.createElement('img');
      img.src = urls.thumb;
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

    list.appendChild(row);
  }

  modal.appendChild(list);

  const footer = document.createElement('div');
  footer.className = 'modal-button-container';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', close);
  footer.appendChild(closeButton);
  modal.appendChild(footer);

  return {
    show: () => {
      show();
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
