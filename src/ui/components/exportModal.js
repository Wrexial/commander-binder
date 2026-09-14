import { escapeHtml } from '../../utils/html.js';
import { createModal } from './modal.js';
import { showToast } from './toast.js';

/**
 * Create the "Export Owned Cards" modal, styled like the Bulk Add / Check
 * modals. Shows the owned card names (newest filterable), with actions to copy
 * them to the clipboard or download them as a .txt file.
 *
 * @param {string[]} names Owned card names, one per line when exported.
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createExportModal(names) {
  const allNames = [...names].sort((a, b) => a.localeCompare(b));

  const shell = createModal({ className: 'bulk-modal', ariaLabel: 'Export Owned Cards' });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';

  const heading = document.createElement('h2');
  heading.textContent = 'Export Owned Cards';

  const subtitle = document.createElement('p');
  subtitle.className = 'bulk-modal-subtitle';
  subtitle.textContent = `${allNames.length} owned card${allNames.length === 1 ? '' : 's'} — one name per line`;

  header.append(heading, subtitle);

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-content-area bulk-content';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'bulk-search-input';
  searchInput.placeholder = 'Filter owned cards…';
  searchInput.setAttribute('aria-label', 'Filter owned cards');

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';

  contentArea.append(searchInput, preview);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-button-container';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'primary export-copy';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'export-download';
  downloadButton.textContent = 'Download .txt';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';

  buttonContainer.append(copyButton, downloadButton, closeButton);

  modal.append(header, contentArea, buttonContainer);

  let visible = allNames;

  function render() {
    const query = searchInput.value.trim().toLowerCase();
    visible = query ? allNames.filter((name) => name.toLowerCase().includes(query)) : allNames;

    if (allNames.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">You don’t own any cards yet.</p>';
    } else if (visible.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">No cards match that filter.</p>';
    } else {
      const rows = visible
        .map((name) => `<li class="bulk-row bulk-row-owned">${escapeHtml(name)}</li>`)
        .join('');
      preview.innerHTML = `
                <div class="bulk-summary">
                    <span class="bulk-summary-chip bulk-chip-owned">Showing <strong>${visible.length}</strong></span>
                    <span class="bulk-summary-chip">Total <strong>${allNames.length}</strong></span>
                </div>
                <ul class="bulk-list">${rows}</ul>`;
    }

    copyButton.textContent = `Copy all ${allNames.length} card${allNames.length === 1 ? '' : 's'}`;
    copyButton.disabled = allNames.length === 0;
    downloadButton.disabled = allNames.length === 0;
  }

  async function copyAll() {
    if (allNames.length === 0) return;

    try {
      await navigator.clipboard.writeText(allNames.join('\n'));
      showToast(`Copied ${allNames.length} card${allNames.length === 1 ? '' : 's'}.`, 'success');
    } catch (err) {
      console.error('Failed to copy owned cards:', err);
      showToast('Could not copy to the clipboard.', 'error');
    }
  }

  function downloadAll() {
    if (allNames.length === 0) return;

    const blob = new Blob([allNames.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'owned-cards.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${allNames.length} card${allNames.length === 1 ? '' : 's'}.`, 'success');
  }

  function show() {
    shell.show();
    searchInput.focus();
  }

  searchInput.addEventListener('input', render);
  copyButton.addEventListener('click', copyAll);
  downloadButton.addEventListener('click', downloadAll);
  closeButton.addEventListener('click', close);

  render();

  return { show, destroy: close };
}
