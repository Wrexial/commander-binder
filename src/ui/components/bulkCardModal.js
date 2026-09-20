import { debounce } from '../../utils/debounce.js';
import { showToast } from './toast.js';
import {
  createCollectionModal,
  createTargetToggle,
  normalizeName,
  previewGroup,
  summaryChip,
} from './collectionModal.js';
import { buildTargetOptions, resolveTarget } from './collectionTargets.js';
import { buildPrintingIndex, findEntryCard, resolveMissingCards } from './cardLookup.js';
import { createCardNameInput } from './cardNameInput.js';
import { attachCardPreview } from './cardPreview.js';
import { parseCollection } from '../../utils/collectionFormats.js';
import { isCardOwned } from '../../state/cardState.js';
import { isCardWanted } from '../../state/wishlistState.js';
import { isInList } from '../../state/listsState.js';
import { isCardInBinder } from '../../state/bindersState.js';

const VALIDATION_DEBOUNCE_MS = 250;

/**
 * Create the "Bulk Check Cards" modal: paste names to see which are in the
 * picked target (collection, wishlist or a custom list), then copy the ones
 * that aren't. (Adding cards lives in `addCardsModal.js`.)
 *
 * @param {{target?: string}} [options] Initial target id.
 * @returns {{ show: () => void, destroy: () => void }}
 */
function buildBulkCheckModal({ target: initialTarget = 'owned' } = {}) {
  const byPrinting = buildPrintingIndex();
  /** Names already looked up live, so a typo isn't re-fetched every pass. */
  const attemptedNames = new Set();

  /** Resolve a target id to the predicate and copy the modal needs. */
  function describeTarget(id) {
    const target = resolveTarget(id);

    if (target.kind === 'wishlist') {
      return {
        present: isCardWanted,
        presentLabel: 'Wanted',
        missingLabel: 'Not wanted',
        targetNoun: 'wishlist',
      };
    }
    if (target.kind === 'owned') {
      return {
        present: isCardOwned,
        presentLabel: 'Owned',
        missingLabel: 'Missing',
        targetNoun: 'collection',
      };
    }

    const present =
      target.kind === 'binder'
        ? (card) => isCardInBinder(target.id, card)
        : (card) => isInList(target.id, card);
    return {
      present,
      presentLabel: `In “${target.name}”`,
      missingLabel: `Not in “${target.name}”`,
      targetNoun: `“${target.name}”`,
    };
  }

  const targetOptions = buildTargetOptions();
  let targetId = targetOptions.some((option) => option.id === initialTarget)
    ? initialTarget
    : 'owned';
  let config = describeTarget(targetId);

  const { shell, close, contentArea, buttons } = createCollectionModal({
    title: 'Bulk Check Cards',
    subtitle: `Paste one card name per line to see what's in your ${config.targetNoun}.`,
    actions: [
      { id: 'primary', className: 'primary' },
      { id: 'close', text: 'Close' },
    ],
  });
  const { primary: primaryButton, close: closeButton } = buttons;
  const subtitle = shell.modal.querySelector('.bulk-modal-subtitle');

  const input = createCardNameInput({
    placeholder: 'One card name per line — “1 Sol Ring” is fine (Ctrl+Enter to copy missing)',
    ariaLabel: 'Card names, one per line',
    onChange: () => renderPreview(),
  });

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';
  attachCardPreview(preview);

  const target = createTargetToggle({
    options: targetOptions,
    initial: targetId,
    onChange: applyTarget,
  });

  contentArea.append(target.el, input.el, preview);

  let categorized = { present: [], missing: [], unknown: [] };

  /** Resolve pasted names the loaded store doesn't have (catalog/live lookup). */
  function resolveMissing() {
    return resolveMissingCards({
      text: input.textArea.value,
      nameIndex: input.nameIndex,
      printingIndex: byPrinting,
      attemptedNames,
    });
  }

  /** Switch the target and relabel the modal; the pasted list stays put. */
  function applyTarget(next) {
    targetId = next;
    config = describeTarget(next);
    subtitle.textContent = `Paste one card name per line to see what's in your ${config.targetNoun}.`;
    renderPreview();
  }

  /**
   * Split the textarea into present / missing / unknown, de-duplicating. Uses
   * the shared collection parser so pasted decklists with quantities
   * ("1 Sol Ring", "2x Arcane Signet") or set/collector suffixes
   * ("1 Sol Ring (CMM) 342") are matched by name.
   */
  function categorize() {
    const { entries } = parseCollection(input.textArea.value);
    const seen = new Set();
    const present = [];
    const missing = [];
    const unknown = [];

    for (const entry of entries) {
      const card = findEntryCard(entry, input.nameIndex, byPrinting);
      const key = normalizeName(card ? card.name : entry.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      if (!card) {
        unknown.push(entry.name);
      } else if (config.present(card)) {
        present.push(card);
      } else {
        missing.push(card);
      }
    }

    return { present, missing, unknown };
  }

  function updatePrimary() {
    const count = categorized.missing.length;
    primaryButton.textContent = count > 0 ? `Copy ${count} missing` : 'Copy missing';
    primaryButton.disabled = count === 0;
  }

  function renderPreview() {
    categorized = categorize();
    const { present, missing, unknown } = categorized;

    if (present.length + missing.length + unknown.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">No card names yet.</p>';
      updatePrimary();
      return;
    }

    preview.innerHTML = `
            <div class="bulk-summary">
                ${summaryChip('owned', config.presentLabel, present.length)}
                ${summaryChip('missing', config.missingLabel, missing.length)}
                ${summaryChip('unknown', 'Not found', unknown.length)}
            </div>
            <div class="bulk-groups">
                ${previewGroup('owned', config.presentLabel, present)}
                ${previewGroup('missing', config.missingLabel, missing)}
                ${previewGroup('unknown', 'Not found', unknown)}
            </div>`;
    updatePrimary();
  }

  async function copyMissing() {
    categorized = categorize();
    const { missing } = categorized;
    if (missing.length === 0) return;

    const text = missing.map((card) => card.name).join('\n');
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
export function createBulkCheckModal(options) {
  if (document.querySelector('.list-modal-backdrop')) return NOOP_MODAL;
  return buildBulkCheckModal(options);
}
