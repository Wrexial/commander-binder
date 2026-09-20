import { debounce } from '../../utils/debounce.js';
import { showToast } from './toast.js';
import {
  createCollectionModal,
  normalizeName,
  previewGroup,
  summaryChip,
} from './collectionModal.js';
import {
  buildPrintingIndex,
  findEntryCard,
  isPendingName,
  resolveMissingCards,
} from './cardLookup.js';
import { createCardNameInput } from './cardNameInput.js';
import { attachCardPreview } from './cardPreview.js';
import { parseCollection } from '../../utils/collectionFormats.js';
import { isCardOwned } from '../../state/cardState.js';
import { isCardWanted } from '../../state/wishlistState.js';
import { getLists, isInList } from '../../state/listsState.js';
import { getBinders, isCardInBinder } from '../../state/bindersState.js';

const VALIDATION_DEBOUNCE_MS = 250;

/**
 * Every place a card can live, in report order. Rebuilt on each pass so it
 * reflects any list/binder that loaded after the modal opened.
 *
 * @returns {{kind: string, label: string, present: (card: object) => boolean}[]}
 */
function collectLocations() {
  return [
    { kind: 'owned', label: 'Collection', present: isCardOwned },
    { kind: 'wishlist', label: 'Wishlist', present: isCardWanted },
    ...getLists().map((list) => ({
      kind: 'list',
      // Prefix so a list never reads like a same-named binder.
      label: `List: ${list.name}`,
      present: (card) => isInList(list.id, card),
    })),
    ...getBinders().map((binder) => ({
      kind: 'binder',
      // Prefix so a binder never reads like a same-named custom list.
      label: `Binder: ${binder.name}`,
      present: (card) => isCardInBinder(binder.id, card),
    })),
  ];
}

/**
 * Create the "Bulk Check Cards" modal: paste names to see *everywhere* each one
 * lives (collection, wishlist, any custom list, any binder), then copy the ones
 * that are missing from all of them. (Adding cards lives in `addCardsModal.js`.)
 *
 * @returns {{ show: () => void, destroy: () => void }}
 */
function buildBulkCheckModal() {
  const byPrinting = buildPrintingIndex();
  /** Names already looked up live, so a typo isn't re-fetched every pass. */
  const attemptedNames = new Set();

  const { shell, close, contentArea, buttons } = createCollectionModal({
    title: 'Bulk Check Cards',
    subtitle:
      'Paste one card name per line to see where each one lives — collection, wishlist, lists and binders.',
    actions: [
      { id: 'primary', className: 'primary' },
      { id: 'close', text: 'Close' },
    ],
  });
  const { primary: primaryButton, close: closeButton } = buttons;

  const input = createCardNameInput({
    placeholder: 'One card name per line — “1 Sol Ring” is fine (Ctrl+Enter to copy missing)',
    ariaLabel: 'Card names, one per line',
    // Picking a suggestion fills the textarea without an `input` event, so kick
    // the resolver too or the new name would stay "unknown".
    onChange: () => {
      renderPreview();
      runValidation();
    },
  });

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';
  attachCardPreview(preview);

  contentArea.append(input.el, preview);

  let categorized = { found: [], missing: [], loading: [], unknown: [] };

  /** Resolve pasted names the loaded store doesn't have (catalog/live lookup). */
  function resolveMissing() {
    return resolveMissingCards({
      text: input.textArea.value,
      nameIndex: input.nameIndex,
      printingIndex: byPrinting,
      attemptedNames,
    });
  }

  /**
   * Split the textarea into found (with the places it lives) / missing
   * everywhere / still loading / unknown, de-duplicating by name. Uses the
   * shared collection parser so pasted decklists with quantities
   * ("1 Sol Ring", "2x Arcane Signet") or set/collector suffixes
   * ("1 Sol Ring (CMM) 342") are matched by name. A real card that just hasn't
   * hydrated yet stays in `loading` rather than being called "not found".
   */
  function categorize() {
    const { entries } = parseCollection(input.textArea.value);
    const seen = new Set();
    const found = [];
    const missing = [];
    const loading = [];
    const unknown = [];
    const locations = collectLocations();

    for (const entry of entries) {
      const card = findEntryCard(entry, input.nameIndex, byPrinting);
      const key = normalizeName(card ? card.name : entry.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      if (card) {
        const matches = locations
          .filter((location) => location.present(card))
          .map((location) => ({ kind: location.kind, label: location.label }));
        const row = { name: card.name, id: card.id, locations: matches };
        if (matches.length > 0) found.push(row);
        else missing.push(row);
      } else if (isPendingName(entry, attemptedNames)) {
        loading.push(entry.name);
      } else {
        unknown.push(entry.name);
      }
    }

    return { found, missing, loading, unknown };
  }

  function updatePrimary() {
    if (categorized.loading.length > 0 && categorized.missing.length === 0) {
      primaryButton.textContent = 'Loading…';
      primaryButton.disabled = true;
      return;
    }

    const count = categorized.missing.length;
    primaryButton.textContent = count > 0 ? `Copy ${count} missing` : 'Copy missing';
    primaryButton.disabled = count === 0;
  }

  function renderPreview() {
    categorized = categorize();
    const { found, missing, loading, unknown } = categorized;

    if (found.length + missing.length + loading.length + unknown.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">No card names yet.</p>';
      updatePrimary();
      return;
    }

    preview.innerHTML = `
            <div class="bulk-summary">
                ${summaryChip('owned', 'Found', found.length)}
                ${summaryChip('missing', 'Missing everywhere', missing.length)}
                ${loading.length > 0 ? summaryChip('pending', 'Loading', loading.length) : ''}
                ${summaryChip('unknown', 'Not found', unknown.length)}
            </div>
            <div class="bulk-groups">
                ${previewGroup('owned', 'Found', found)}
                ${previewGroup('missing', 'Missing everywhere', missing)}
                ${previewGroup('pending', 'Loading…', loading)}
                ${previewGroup('unknown', 'Not found', unknown)}
            </div>`;
    updatePrimary();
  }

  async function copyMissing() {
    // Resolve first so a name still hydrating isn't silently left out of the
    // copied list.
    await resolveMissing();
    categorized = categorize();
    const { missing } = categorized;
    if (missing.length === 0) return;

    const text = missing.map((row) => row.name).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast(
        `Copied ${missing.length} missing card${missing.length === 1 ? '' : 's'}.`,
        'success'
      );
    } catch (err) {
      console.error('Failed to copy missing cards:', err);
      showToast('Could not copy to the clipboard.', 'error');
    }
  }

  // The immediate render uses whatever is already loaded; the debounced pass
  // then resolves any all-cards catalog names and re-renders.
  const runValidation = debounce(async () => {
    await resolveMissing();
    renderPreview();
  }, VALIDATION_DEBOUNCE_MS);

  input.textArea.addEventListener('input', () => {
    renderPreview();
    runValidation();
  });
  input.textArea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      copyMissing();
    }
  });
  primaryButton.addEventListener('click', copyMissing);
  closeButton.addEventListener('click', close);

  renderPreview();

  return {
    show: () => {
      shell.show();
      input.textArea.focus();
    },
    destroy: close,
  };
}

const NOOP_MODAL = { show: () => {}, destroy: () => {} };

/** Open the bulk-check modal, unless another modal is already open. */
export function createBulkCheckModal() {
  if (document.querySelector('.list-modal-backdrop')) return NOOP_MODAL;
  return buildBulkCheckModal();
}
