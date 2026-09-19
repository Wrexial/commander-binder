import { debounce } from '../../utils/debounce.js';
import { showToast } from './toast.js';
import {
  binderIdFromTarget,
  binderTargetId,
  createCollectionModal,
  createTargetToggle,
  isBinderTargetId,
  normalizeName,
  previewGroup,
  summaryChip,
} from './collectionModal.js';
import { createCardNameInput } from './cardNameInput.js';
import { parseCollection } from '../../utils/collectionFormats.js';
import { cardStore } from '../../state/cardStore.js';
import { isCardOwned } from '../../state/cardState.js';
import { isCardWanted } from '../../state/wishlistState.js';
import { getList, getLists, isInList } from '../../state/listsState.js';
import { getBinder, getBinders, isCardInBinder } from '../../state/bindersState.js';
import { resolveCatalogPrintingId } from '../../state/cardCatalog.js';
import { hydrateCardsByIds } from '../../api/cardSearch.js';

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
  /** Resolve a target id to the predicate and copy the modal needs. */
  function describeTarget(id) {
    if (id === 'wishlist') {
      return {
        present: isCardWanted,
        presentLabel: 'Wanted',
        missingLabel: 'Not wanted',
        targetNoun: 'wishlist',
      };
    }
    if (id === 'owned') {
      return {
        present: isCardOwned,
        presentLabel: 'Owned',
        missingLabel: 'Missing',
        targetNoun: 'collection',
      };
    }

    if (isBinderTargetId(id)) {
      const binderId = binderIdFromTarget(id);
      const name = getBinder(binderId)?.name || 'binder';
      return {
        present: (card) => isCardInBinder(binderId, card),
        presentLabel: `In “${name}”`,
        missingLabel: `Not in “${name}”`,
        targetNoun: `“${name}”`,
      };
    }

    const name = getList(id)?.name || 'list';
    return {
      present: (card) => isInList(id, card),
      presentLabel: `In “${name}”`,
      missingLabel: `Not in “${name}”`,
      targetNoun: `“${name}”`,
    };
  }

  const targetOptions = [
    { id: 'owned', label: 'Collection' },
    { id: 'wishlist', label: 'Wishlist' },
    ...getLists().map((list) => ({ id: list.id, label: list.name })),
    ...getBinders().map((binder) => ({
      id: binderTargetId(binder.id),
      label: `Binder: ${binder.name}`,
    })),
  ];
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

  const target = createTargetToggle({
    options: targetOptions,
    initial: targetId,
    onChange: applyTarget,
  });

  contentArea.append(target.el, input.el, preview);

  let categorized = { present: [], missing: [], unknown: [] };

  /**
   * Resolve pasted names that aren't in the loaded store but are known to the
   * all-cards catalog, fetching their printings in one batched request so the
   * check covers every card, not just the legendary subset.
   *
   * @returns {Promise<boolean>} whether new cards were loaded
   */
  async function resolveCatalogMatches() {
    const { entries } = parseCollection(input.textArea.value);
    const ids = new Set();

    for (const entry of entries) {
      const raw = normalizeName(entry.raw ?? '');
      const name = normalizeName(entry.name);
      if (input.nameIndex.has(raw) || input.nameIndex.has(name)) continue;
      const id = resolveCatalogPrintingId(entry.raw ?? '') || resolveCatalogPrintingId(entry.name);
      if (id) ids.add(id);
    }

    if (ids.size === 0) return false;
    const before = cardStore.getAll().length;
    await hydrateCardsByIds([...ids]);
    const changed = cardStore.getAll().length > before;
    if (changed) {
      for (const card of cardStore.getAll()) {
        const key = normalizeName(card.name);
        if (key && !input.nameIndex.has(key)) input.nameIndex.set(key, card);
      }
    }
    return changed;
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
      // Prefer the pasted text verbatim so a card whose name genuinely starts
      // with a number ("1996 World Champion") still matches; only fall back to
      // the quantity-stripped name when the raw text isn't a known card.
      const card =
        input.nameIndex.get(normalizeName(entry.raw ?? '')) ||
        input.nameIndex.get(normalizeName(entry.name)) ||
        null;

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
                ${previewGroup(
                  'owned',
                  config.presentLabel,
                  present.map((card) => card.name)
                )}
                ${previewGroup(
                  'missing',
                  config.missingLabel,
                  missing.map((card) => card.name)
                )}
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
    await resolveCatalogMatches();
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
