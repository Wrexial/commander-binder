import { debounce } from '../../utils/debounce.js';
import { showToast } from './toast.js';
import {
  addOwnedCards,
  createCollectionModal,
  normalizeName,
  previewGroup,
  summaryChip,
} from './collectionModal.js';
import { parseCollection } from '../../utils/collectionFormats.js';
import { cardStore } from '../../state/cardStore.js';
import { isCardOwned } from '../../state/cardState.js';

const PREVIEW_DEBOUNCE_MS = 250;

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

  const { shell, close, contentArea, buttons } = createCollectionModal({
    title: 'Import Collection',
    subtitle:
      'Paste a CSV, Moxfield, or Archidekt export, or choose a file. Matched cards are marked as owned.',
    actions: [
      { id: 'primary', className: 'primary' },
      { id: 'close', text: 'Close' },
    ],
  });
  const { primary: primaryButton, close: closeButton } = buttons;

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
                ${previewGroup(
                  'missing',
                  'Will import',
                  add.map((card) => card.name)
                )}
                ${previewGroup(
                  'owned',
                  'Already owned',
                  owned.map((card) => card.name)
                )}
                ${previewGroup('unknown', 'Not found', unknown)}
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
      await addOwnedCards(add, `Imported ${add.length} card${add.length === 1 ? '' : 's'}.`);
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
