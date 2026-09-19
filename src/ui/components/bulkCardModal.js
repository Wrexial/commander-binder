import { debounce } from '../../utils/debounce.js';
import { showToast } from './toast.js';
import {
  createCollectionModal,
  normalizeName,
  previewGroup,
  summaryChip,
} from './collectionModal.js';
import { createCardNameInput } from './cardNameInput.js';
import { isCardOwned } from '../../state/cardState.js';

const VALIDATION_DEBOUNCE_MS = 250;

/**
 * Create the "Bulk Check Cards" modal: paste names to see which you own, then
 * copy the missing ones. (Adding cards lives in `addCardsModal.js`.)
 *
 * @returns {{ show: () => void, destroy: () => void }}
 */
function buildBulkCheckModal() {
  const { shell, close, contentArea, buttons } = createCollectionModal({
    title: 'Bulk Check Cards',
    subtitle: 'Paste one card name per line to see what you own.',
    actions: [
      { id: 'primary', className: 'primary' },
      { id: 'close', text: 'Close' },
    ],
  });
  const { primary: primaryButton, close: closeButton } = buttons;

  const input = createCardNameInput({
    placeholder: 'One card name per line (Ctrl+Enter to copy missing)',
    ariaLabel: 'Card names, one per line',
    onChange: () => renderPreview(),
  });

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';

  contentArea.append(input.el, preview);

  let categorized = { owned: [], missing: [], unknown: [] };

  /** Split the textarea into owned / missing / unknown, de-duplicating. */
  function categorize() {
    const seen = new Set();
    const owned = [];
    const missing = [];
    const unknown = [];

    for (const line of input.textArea.value.split('\n')) {
      const key = normalizeName(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const card = input.nameIndex.get(key);
      if (!card) {
        unknown.push(line.trim());
      } else if (isCardOwned(card)) {
        owned.push(card);
      } else {
        missing.push(card);
      }
    }

    return { owned, missing, unknown };
  }

  function updatePrimary() {
    const count = categorized.missing.length;
    primaryButton.textContent = count > 0 ? `Copy ${count} missing` : 'Copy missing';
    primaryButton.disabled = count === 0;
  }

  function renderPreview() {
    categorized = categorize();
    const { owned, missing, unknown } = categorized;

    if (owned.length + missing.length + unknown.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">No card names yet.</p>';
      updatePrimary();
      return;
    }

    preview.innerHTML = `
            <div class="bulk-summary">
                ${summaryChip('owned', 'Owned', owned.length)}
                ${summaryChip('missing', 'Missing', missing.length)}
                ${summaryChip('unknown', 'Not found', unknown.length)}
            </div>
            <div class="bulk-groups">
                ${previewGroup(
                  'owned',
                  'Owned',
                  owned.map((card) => card.name)
                )}
                ${previewGroup(
                  'missing',
                  'Missing',
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

  const runValidation = debounce(renderPreview, VALIDATION_DEBOUNCE_MS);

  input.textArea.addEventListener('input', runValidation);
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
