import { escapeHtml } from '../../utils/html.js';
import { showToast } from './toast.js';
import { createCollectionModal, createTargetToggle } from './collectionModal.js';
import {
  DEFAULT_TRANSFER_FORMAT,
  TEXT_TRANSFER_FORMATS,
  TRANSFER_FORMATS,
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

/**
 * The combined export modal. Each entry in `collections` is
 * `{ id, label, cards, filePrefix, noun, emptyMessage }`; the picker switches
 * the active one and the format/filter controls apply to whichever is active.
 *
 * @param {{collections: object[], title?: string}} options
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createExportModal({ collections, title = 'Export Cards' }) {
  // Prefer a collection that actually has cards, so the modal doesn't open on
  // an empty side when the other one has content.
  let active = collections.find((collection) => collection.cards.length > 0) || collections[0];
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
    const visible = query
      ? allCards.filter((card) => card.name.toLowerCase().includes(query))
      : allCards;

    subtitle.textContent = `${allCards.length} ${noun} card${allCards.length === 1 ? '' : 's'} — choose a format to copy or download`;
    searchInput.placeholder = `Filter ${noun} cards…`;
    searchInput.setAttribute('aria-label', `Filter ${noun} cards`);

    if (allCards.length === 0) {
      preview.innerHTML = `<p class="bulk-empty">${emptyMessage}</p>`;
    } else if (visible.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">No cards match that filter.</p>';
    } else {
      const rows = visible
        .map((card) => `<li class="bulk-row bulk-row-owned">${escapeHtml(card.name)}</li>`)
        .join('');
      preview.innerHTML = `
                <div class="bulk-summary">
                    <span class="bulk-summary-chip bulk-chip-owned">Showing <strong>${visible.length}</strong></span>
                    <span class="bulk-summary-chip">Total <strong>${allCards.length}</strong></span>
                </div>
                <ul class="bulk-list">${rows}</ul>`;
    }

    const label = TRANSFER_FORMATS.find((format) => format.id === currentFormat())?.label ?? 'CSV';
    copyButton.textContent = `Copy all ${allCards.length} card${allCards.length === 1 ? '' : 's'}`;
    downloadButton.textContent = `Download ${label}`;
    copyButton.disabled = allCards.length === 0;
    downloadButton.disabled = allCards.length === 0;
  }

  async function copyAll() {
    if (allCards.length === 0) return;

    try {
      // The full collection is exported; the filter only affects the preview.
      await navigator.clipboard.writeText(serializeCollection(allCards, currentFormat()));
      showToast(`Copied ${allCards.length} card${allCards.length === 1 ? '' : 's'}.`, 'success');
    } catch (err) {
      console.error('Failed to copy cards:', err);
      showToast('Could not copy to the clipboard.', 'error');
    }
  }

  function downloadAll() {
    if (allCards.length === 0) return;

    const blob = new Blob([serializeCollection(allCards, currentFormat())], {
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
    showToast(`Downloaded ${allCards.length} card${allCards.length === 1 ? '' : 's'}.`, 'success');
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
