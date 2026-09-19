import { debounce } from '../../utils/debounce.js';
import { showToast } from './toast.js';
import {
  addOwnedCards,
  addWantedCards,
  createCollectionModal,
  createTargetToggle,
  normalizeName,
  previewGroup,
  summaryChip,
} from './collectionModal.js';
import { createCardNameInput } from './cardNameInput.js';
import { parseCollection } from '../../utils/collectionFormats.js';
import { cardStore } from '../../state/cardStore.js';
import { isCardOwned } from '../../state/cardState.js';
import { isCardWanted } from '../../state/wishlistState.js';

const PREVIEW_DEBOUNCE_MS = 250;

/** One pass over the store: "set:number" (lowercase set) -> exact printing. */
function buildPrintingIndex() {
  const byPrinting = new Map();
  for (const card of cardStore.getAll()) {
    for (const printing of cardStore.getPrintings(card.name)) {
      if (printing.set && printing.collector_number) {
        byPrinting.set(`${printing.set.toLowerCase()}:${printing.collector_number}`, printing);
      }
    }
  }
  return byPrinting;
}

/**
 * The combined "Add Cards" modal. Accepts typed names (with autocomplete), a
 * pasted plain list or CSV / Moxfield / Archidekt export, or a file, then marks
 * the not-yet-present matches owned or wanted depending on the target picker.
 *
 * @param {{kind?: 'owned'|'wishlist'}} [options] Initial target.
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createAddCardsModal({ kind: initialKind = 'owned' } = {}) {
  const byPrinting = buildPrintingIndex();

  let isWishlist = initialKind === 'wishlist';
  let isPresent = isWishlist ? isCardWanted : isCardOwned;
  let addCards = isWishlist ? addWantedCards : addOwnedCards;
  let presentLabel = isWishlist ? 'Already wanted' : 'Already owned';
  let successSuffix = isWishlist ? ' to your wishlist' : '';

  const { shell, close, contentArea, buttons } = createCollectionModal({
    title: isWishlist ? 'Add to Wishlist' : 'Add Cards',
    subtitle: `Type names, paste a list or a CSV / Moxfield / Archidekt export, or choose a file. Cards you already ${isWishlist ? 'want' : 'own'} are skipped.`,
    actions: [
      { id: 'primary', className: 'primary' },
      { id: 'close', text: 'Close' },
    ],
  });
  const { primary: primaryButton, close: closeButton } = buttons;
  const heading = shell.modal.querySelector('.bulk-modal-header h2');
  const subtitle = shell.modal.querySelector('.bulk-modal-subtitle');

  const toolbar = document.createElement('div');
  toolbar.className = 'transfer-toolbar';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'transfer-file';
  fileInput.accept = '.csv,.txt,text/csv,text/plain';
  fileInput.setAttribute('aria-label', 'Choose a collection file');
  toolbar.appendChild(fileInput);

  const input = createCardNameInput({
    placeholder: 'One card name per line, or paste a list (Ctrl+Enter to add)',
    ariaLabel: 'Cards to add',
    onChange: () => renderPreview(),
  });

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';

  const target = createTargetToggle({
    initial: isWishlist ? 'wishlist' : 'owned',
    onChange: applyKind,
  });

  contentArea.append(target.el, toolbar, input.el, preview);

  let categorized = { add: [], present: [], unknown: [] };
  let confirming = false;

  /** Switch the target and relabel the modal; the parsed list stays put. */
  function applyKind(next) {
    isWishlist = next === 'wishlist';
    isPresent = isWishlist ? isCardWanted : isCardOwned;
    addCards = isWishlist ? addWantedCards : addOwnedCards;
    presentLabel = isWishlist ? 'Already wanted' : 'Already owned';
    successSuffix = isWishlist ? ' to your wishlist' : '';

    heading.textContent = isWishlist ? 'Add to Wishlist' : 'Add Cards';
    subtitle.textContent = `Type names, paste a list or a CSV / Moxfield / Archidekt export, or choose a file. Cards you already ${isWishlist ? 'want' : 'own'} are skipped.`;
    renderPreview();
  }

  /** Resolve parsed entries to store cards, split into new / present / unknown. */
  function categorize() {
    const { entries } = parseCollection(input.textArea.value);
    const seen = new Set();
    const add = [];
    const present = [];
    const unknown = [];

    for (const entry of entries) {
      let card = null;
      if (entry.setCode && entry.collectorNumber) {
        card = byPrinting.get(`${entry.setCode}:${entry.collectorNumber}`) || null;
      }
      card ||= input.nameIndex.get(normalizeName(entry.name)) || null;

      if (!card) {
        unknown.push(entry.name);
        continue;
      }
      if (seen.has(card.id)) continue;
      seen.add(card.id);

      if (isPresent(card)) present.push(card);
      else add.push(card);
    }

    return { add, present, unknown };
  }

  function updatePrimary() {
    const count = categorized.add.length;
    if (isWishlist) {
      primaryButton.textContent = count > 0 ? `Add ${count} to wishlist` : 'Add to wishlist';
    } else {
      primaryButton.textContent =
        count > 0 ? `Add ${count} card${count === 1 ? '' : 's'}` : 'Add cards';
    }
    primaryButton.disabled = count === 0 || confirming;
  }

  function renderPreview() {
    categorized = categorize();
    const { add, present, unknown } = categorized;

    if (add.length + present.length + unknown.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">Nothing to add yet.</p>';
      updatePrimary();
      return;
    }

    preview.innerHTML = `
            <div class="bulk-summary">
                ${summaryChip('missing', 'Will add', add.length)}
                ${summaryChip('owned', presentLabel, present.length)}
                ${summaryChip('unknown', 'Not found', unknown.length)}
            </div>
            <div class="bulk-groups">
                ${previewGroup(
                  'missing',
                  'Will add',
                  add.map((card) => card.name)
                )}
                ${previewGroup(
                  'owned',
                  presentLabel,
                  present.map((card) => card.name)
                )}
                ${previewGroup('unknown', 'Not found', unknown)}
            </div>`;
    updatePrimary();
  }

  async function handleAdd() {
    if (confirming) return;

    categorized = categorize();
    const { add } = categorized;
    if (add.length === 0) return;

    confirming = true;
    updatePrimary();
    try {
      await addCards(
        add,
        `Added ${add.length} card${add.length === 1 ? '' : 's'}${successSuffix}.`
      );
      // Re-render: the added cards now show up under "Already ...".
      renderPreview();
    } catch (err) {
      console.error('Add cards failed:', err);
      showToast('Could not add the cards.', 'error');
    } finally {
      confirming = false;
      updatePrimary();
    }
  }

  const runValidation = debounce(renderPreview, PREVIEW_DEBOUNCE_MS);

  input.textArea.addEventListener('input', runValidation);
  input.textArea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleAdd();
    }
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      input.textArea.value = await file.text();
      renderPreview();
    } catch (err) {
      console.error('Failed to read the file:', err);
      showToast('Could not read that file.', 'error');
    }
  });
  primaryButton.addEventListener('click', handleAdd);
  closeButton.addEventListener('click', close);

  function show() {
    shell.show();
    input.textArea.focus();
  }

  renderPreview();

  return { show, destroy: close };
}
