import { escapeHtml } from '../../utils/html.js';
import { createModal } from './modal.js';
import { showToast } from './toast.js';
import {
  DEFAULT_TRANSFER_FORMAT,
  TRANSFER_FORMATS,
  serializeCollection,
} from '../../utils/collectionFormats.js';

/** "owned-cards.csv" / "owned-cards-moxfield.csv". */
function exportFileName(format) {
  return format === DEFAULT_TRANSFER_FORMAT ? 'owned-cards.csv' : `owned-cards-${format}.csv`;
}

/**
 * Create the "Export Owned Cards" modal, styled like the Bulk Add / Check
 * modals. Lets the collector pick an output format (our CSV, Moxfield, or
 * Archidekt), filter the preview, then copy or download the serialized file.
 *
 * @param {object[]} cards Owned Scryfall card objects (one per card).
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createExportModal(cards) {
  const allCards = [...cards].sort((a, b) => a.name.localeCompare(b.name));

  const shell = createModal({ className: 'bulk-modal', ariaLabel: 'Export Owned Cards' });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';

  const heading = document.createElement('h2');
  heading.textContent = 'Export Owned Cards';

  const subtitle = document.createElement('p');
  subtitle.className = 'bulk-modal-subtitle';
  subtitle.textContent = `${allCards.length} owned card${allCards.length === 1 ? '' : 's'} — choose a format to copy or download`;

  header.append(heading, subtitle);

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-content-area bulk-content';

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
  searchInput.placeholder = 'Filter owned cards…';
  searchInput.setAttribute('aria-label', 'Filter owned cards');

  toolbar.append(formatLabel, searchInput);

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';

  contentArea.append(toolbar, preview);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-button-container';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'primary export-copy';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'export-download';
  downloadButton.textContent = 'Download';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';

  buttonContainer.append(copyButton, downloadButton, closeButton);

  modal.append(header, contentArea, buttonContainer);

  let visible = allCards;

  function currentFormat() {
    return formatSelect.value || DEFAULT_TRANSFER_FORMAT;
  }

  function render() {
    const query = searchInput.value.trim().toLowerCase();
    visible = query ? allCards.filter((card) => card.name.toLowerCase().includes(query)) : allCards;

    if (allCards.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">You don’t own any cards yet.</p>';
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
      console.error('Failed to copy owned cards:', err);
      showToast('Could not copy to the clipboard.', 'error');
    }
  }

  function downloadAll() {
    if (allCards.length === 0) return;

    const blob = new Blob([serializeCollection(allCards, currentFormat())], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(currentFormat());
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
