import { debounce } from '../../utils/debounce.js';
import { escapeHtml } from '../../utils/html.js';
import { createModal } from './modal.js';
import { showToast } from './toast.js';
import { parseCollection } from '../../utils/collectionFormats.js';
import { cardStore } from '../../state/cardStore.js';
import { isCardOwned, setCardsOwned } from '../../state/cardState.js';
import { updateAllCardStates } from '../cards.js';
import { updateAllBinderCounts } from '../layout.js';
import { updateOwnedCounter } from './ownedCounter.js';

const PREVIEW_DEBOUNCE_MS = 250;

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

/** One pass over the store: name -> default printing, and "set:number" -> printing. */
function buildIndexes() {
  const byName = new Map();
  const byPrinting = new Map();

  for (const card of cardStore.getAll()) {
    const key = normalizeName(card.name);
    if (key && !byName.has(key)) byName.set(key, card);

    for (const printing of cardStore.getPrintings(card.name)) {
      if (printing.set && printing.collector_number) {
        byPrinting.set(`${printing.set.toLowerCase()}:${printing.collector_number}`, printing);
      }
    }
  }

  return { byName, byPrinting };
}

/**
 * Create the "Import Collection" modal. Accepts pasted text or a file from any
 * supported source (our CSV, Moxfield, Archidekt, or a plain name list),
 * matches entries against the loaded collection, and marks the new ones owned.
 *
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createImportModal() {
  const { byName, byPrinting } = buildIndexes();

  const shell = createModal({ className: 'bulk-modal', ariaLabel: 'Import Collection' });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';

  const heading = document.createElement('h2');
  heading.textContent = 'Import Collection';

  const subtitle = document.createElement('p');
  subtitle.className = 'bulk-modal-subtitle';
  subtitle.textContent =
    'Paste a CSV, Moxfield, or Archidekt export, or choose a file. Matched cards are marked as owned.';

  header.append(heading, subtitle);

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-content-area bulk-content';

  const toolbar = document.createElement('div');
  toolbar.className = 'transfer-toolbar';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'transfer-file';
  fileInput.accept = '.csv,.txt,text/csv,text/plain';
  fileInput.setAttribute('aria-label', 'Choose a collection file');

  toolbar.appendChild(fileInput);

  const textArea = document.createElement('textarea');
  textArea.className = 'transfer-textarea';
  textArea.rows = 7;
  textArea.placeholder = 'Paste your collection here…';
  textArea.spellcheck = false;
  textArea.setAttribute('aria-label', 'Collection text to import');

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';

  contentArea.append(toolbar, textArea, preview);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-button-container';

  const primaryButton = document.createElement('button');
  primaryButton.type = 'button';
  primaryButton.className = 'primary';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';

  buttonContainer.append(primaryButton, closeButton);
  modal.append(header, contentArea, buttonContainer);

  let categorized = { add: [], owned: [], unknown: [] };
  let confirming = false;

  /** Resolve parsed entries to store cards, split into new / owned / unknown. */
  function categorize() {
    const { entries } = parseCollection(textArea.value);
    const seen = new Set();
    const add = [];
    const owned = [];
    const unknown = [];

    for (const entry of entries) {
      let card = null;
      if (entry.setCode && entry.collectorNumber) {
        card = byPrinting.get(`${entry.setCode}:${entry.collectorNumber}`) || null;
      }
      card ||= byName.get(normalizeName(entry.name)) || null;

      if (!card) {
        unknown.push(entry.name);
        continue;
      }
      if (seen.has(card.id)) continue;
      seen.add(card.id);

      if (isCardOwned(card)) owned.push(card);
      else add.push(card);
    }

    return { add, owned, unknown };
  }

  function summaryChip(status, label, count) {
    return `<span class="bulk-summary-chip bulk-chip-${status}">${label} <strong>${count}</strong></span>`;
  }

  function group(status, label, names) {
    if (names.length === 0) return '';

    const rows = names
      .map((name) => `<li class="bulk-row bulk-row-${status}">${escapeHtml(name)}</li>`)
      .join('');

    return `<section class="bulk-group"><h3>${label}<span>${names.length}</span></h3><ul>${rows}</ul></section>`;
  }

  function updatePrimary() {
    const count = categorized.add.length;
    primaryButton.textContent =
      count > 0 ? `Import ${count} card${count === 1 ? '' : 's'}` : 'Import cards';
    primaryButton.disabled = count === 0 || confirming;
  }

  function renderPreview() {
    categorized = categorize();
    const { add, owned, unknown } = categorized;

    if (add.length + owned.length + unknown.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">Nothing to import yet.</p>';
      updatePrimary();
      return;
    }

    preview.innerHTML = `
            <div class="bulk-summary">
                ${summaryChip('missing', 'New', add.length)}
                ${summaryChip('owned', 'Already owned', owned.length)}
                ${summaryChip('unknown', 'Not found', unknown.length)}
            </div>
            <div class="bulk-groups">
                ${group(
                  'missing',
                  'Will import',
                  add.map((card) => card.name)
                )}
                ${group(
                  'owned',
                  'Already owned',
                  owned.map((card) => card.name)
                )}
                ${group('unknown', 'Not found', unknown)}
            </div>`;
    updatePrimary();
  }

  async function handleImport() {
    if (confirming) return;

    categorized = categorize();
    const { add } = categorized;
    if (add.length === 0) return;

    confirming = true;
    updatePrimary();
    try {
      await setCardsOwned(add, true);
      showToast(`Imported ${add.length} card${add.length === 1 ? '' : 's'}.`, 'success');
      updateAllCardStates();
      updateAllBinderCounts();
      updateOwnedCounter();
      // Re-render: the imported cards now show up under "Already owned".
      renderPreview();
    } catch (err) {
      console.error('Import failed:', err);
      showToast('Could not import the collection.', 'error');
    } finally {
      confirming = false;
      updatePrimary();
    }
  }

  const runValidation = debounce(renderPreview, PREVIEW_DEBOUNCE_MS);

  textArea.addEventListener('input', runValidation);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      textArea.value = await file.text();
      renderPreview();
    } catch (err) {
      console.error('Failed to read the import file:', err);
      showToast('Could not read that file.', 'error');
    }
  });
  primaryButton.addEventListener('click', handleImport);
  closeButton.addEventListener('click', close);

  function show() {
    shell.show();
    textArea.focus();
  }

  renderPreview();

  return { show, destroy: close };
}
