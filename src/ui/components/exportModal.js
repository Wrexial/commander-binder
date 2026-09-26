import { escapeHtml } from '../../utils/html.js';
import { showToast } from './toast.js';
import { createCollectionModal, createTargetToggle } from './collectionModal.js';
import { attachCardPreview } from './cardPreview.js';
import {
  DEFAULT_TRANSFER_FORMAT,
  TEXT_TRANSFER_FORMATS,
  TRANSFER_FORMATS,
  cardQuantity,
  serializeCollection,
} from '../../utils/collectionFormats.js';

/** "owned-cards.csv" / "wishlist-arena.txt". */
function exportFileName(format, prefix) {
  const extension = TEXT_TRANSFER_FORMATS.has(format) ? 'txt' : 'csv';
  return format === DEFAULT_TRANSFER_FORMAT
    ? `${prefix}.${extension}`
    : `${prefix}-${format}.${extension}`;
}

/** Sort a collection's cards by name without mutating the source array. */
function sortedByName(cards) {
  return [...cards].sort((a, b) => a.name.localeCompare(b.name));
}

/** Total copies in a list of aggregated card entries (one per card). */
function totalQuantity(cards) {
  return cards.reduce((sum, card) => sum + cardQuantity(card), 0);
}

/**
 * The combined export modal. Each entry in `collections` is
 * `{ id, label, cards, filePrefix, noun, emptyMessage }`; the picker switches
 * the active one and the format/filter controls apply to whichever is active.
 *
 * @param {{collections: object[], title?: string, initialId?: string}} options
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createExportModal({ collections, title = 'Export Cards', initialId }) {
  // Prefer the requested collection (e.g. the binder currently on screen), then
  // one that actually has cards, so the modal doesn't open on an empty side.
  let active =
    collections.find((collection) => collection.id === initialId) ||
    collections.find((collection) => collection.cards.length > 0) ||
    collections[0];
  let allCards = sortedByName(active.cards);

  const { shell, close, contentArea, buttons } = createCollectionModal({
    title,
    subtitle: '',
    actions: [
      { id: 'copy', className: 'primary export-copy' },
      { id: 'download', className: 'export-download', text: 'Download' },
      { id: 'close', text: 'Close' },
    ],
  });
  const { copy: copyButton, download: downloadButton, close: closeButton } = buttons;
  const subtitle = shell.modal.querySelector('.bulk-modal-subtitle');

  const toolbar = document.createElement('div');
  toolbar.className = 'transfer-toolbar';

  const formatLabel = document.createElement('label');
  formatLabel.className = 'transfer-format-label';
  formatLabel.textContent = 'Format';

  const formatSelect = document.createElement('select');
  formatSelect.className = 'transfer-format';
  formatSelect.setAttribute('aria-label', 'Export format');
  for (const format of TRANSFER_FORMATS) {
    const option = document.createElement('option');
    option.value = format.id;
    option.textContent = format.label;
    formatSelect.appendChild(option);
  }
  formatSelect.value = DEFAULT_TRANSFER_FORMAT;
  formatLabel.appendChild(formatSelect);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'bulk-search-input';

  toolbar.append(formatLabel, searchInput);

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';
  attachCardPreview(preview);
  // The active collection's cards after the search filter; the export follows it.
  let visibleCards = allCards;

  if (collections.length > 1) {
    const target = createTargetToggle({
      options: collections.map((collection) => ({
        id: collection.id,
        label: collection.label,
      })),
      initial: active.id,
      onChange: setActive,
    });
    contentArea.append(target.el, toolbar, preview);
  } else {
    contentArea.append(toolbar, preview);
  }

  function setActive(id) {
    active = collections.find((collection) => collection.id === id) || active;
    allCards = sortedByName(active.cards);
    // A leftover filter would read as "no cards" after switching.
    searchInput.value = '';
    render();
  }

  function currentFormat() {
    return formatSelect.value || DEFAULT_TRANSFER_FORMAT;
  }

  function render() {
    const { noun, emptyMessage } = active;
    const query = searchInput.value.trim().toLowerCase();
    visibleCards = query
      ? allCards.filter((card) => card.name.toLowerCase().includes(query))
      : allCards;

    const total = totalQuantity(allCards);
    const visible = totalQuantity(visibleCards);
    subtitle.textContent = `${total} ${noun} card${total === 1 ? '' : 's'} — choose a format to copy or download`;
    searchInput.placeholder = `Filter ${noun} cards…`;
    searchInput.setAttribute('aria-label', `Filter ${noun} cards`);

    if (allCards.length === 0) {
      preview.innerHTML = `<p class="bulk-empty">${emptyMessage}</p>`;
    } else if (visibleCards.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">No cards match that filter.</p>';
    } else {
      const rows = visibleCards
        .map((card) => {
          // Aggregated binder entries carry a quantity; show it so "2 Lightning
          // Bolt" is visible before the export.
          const quantity = cardQuantity(card);
          const label = quantity > 1 ? `${quantity}× ${card.name}` : card.name;
          return `<li class="bulk-row bulk-row-owned" data-card-preview data-card-id="${escapeHtml(card.id)}">${escapeHtml(label)}</li>`;
        })
        .join('');
      preview.innerHTML = `
                <div class="bulk-summary">
                    <span class="bulk-summary-chip bulk-chip-owned">Showing <strong>${visible}</strong></span>
                    <span class="bulk-summary-chip">Total <strong>${total}</strong></span>
                </div>
                <ul class="bulk-list">${rows}</ul>`;
    }

    const label = TRANSFER_FORMATS.find((format) => format.id === currentFormat())?.label ?? 'CSV';
    copyButton.textContent = `Copy ${visible} card${visible === 1 ? '' : 's'}`;
    downloadButton.textContent = `Download ${label}`;
    copyButton.disabled = visible === 0;
    downloadButton.disabled = visible === 0;
  }

  async function copyAll() {
    if (visibleCards.length === 0) return;

    const count = totalQuantity(visibleCards);
    try {
      // The filter narrows the export, matching what the preview shows.
      await navigator.clipboard.writeText(serializeCollection(visibleCards, currentFormat()));
      showToast(`Copied ${count} card${count === 1 ? '' : 's'}.`, 'success');
    } catch (err) {
      console.error('Failed to copy cards:', err);
      showToast('Could not copy to the clipboard.', 'error');
    }
  }

  function downloadAll() {
    if (visibleCards.length === 0) return;

    const count = totalQuantity(visibleCards);
    const blob = new Blob([serializeCollection(visibleCards, currentFormat())], {
      type: TEXT_TRANSFER_FORMATS.has(currentFormat())
        ? 'text/plain;charset=utf-8'
        : 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(currentFormat(), active.filePrefix);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${count} card${count === 1 ? '' : 's'}.`, 'success');
  }

  function show() {
    shell.show();
    searchInput.focus();
  }

  formatSelect.addEventListener('change', render);
  searchInput.addEventListener('input', render);
  copyButton.addEventListener('click', copyAll);
  downloadButton.addEventListener('click', downloadAll);
  closeButton.addEventListener('click', close);

  render();

  return { show, destroy: close };
}
