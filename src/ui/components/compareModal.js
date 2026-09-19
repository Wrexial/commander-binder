import { getOwnedCardIds } from '../../state/cardState.js';
import { loadViewerCollection } from '../../state/compareState.js';
import { cardStore, primaryName } from '../../state/cardStore.js';
import { diffCollections } from '../../utils/compareCollections.js';
import { createCollectionModal, previewGroup, summaryChip } from './collectionModal.js';

/**
 * A comparison key for a printing id: the card's name when the printing is
 * loaded (so different printings of one card count once), otherwise the raw id
 * so an unloaded card never silently disappears from the diff.
 */
function keyFor(id) {
  const card = cardStore.getByPrintingId(id);
  return card ? primaryName(card) : id;
}

/** A display label for a comparison key. */
function labelFor(key) {
  const byId = cardStore.getByPrintingId(key);
  if (byId) return byId.name;
  const oldest = cardStore.getOldestPrinting(key);
  return oldest ? oldest.name : key;
}

function sortedLabels(keys) {
  return keys.map(labelFor).sort((a, b) => a.localeCompare(b));
}

function render(contentArea, modal, diff) {
  const subtitle = modal.querySelector('.bulk-modal-subtitle');
  if (subtitle) {
    subtitle.textContent =
      `${diff.ownerOnly.length} they have that you're missing · ` +
      `${diff.viewerOnly.length} you have that they're missing`;
  }

  const summary = `
    <div class="bulk-summary">
      ${summaryChip('missing', "They have · you're missing", diff.ownerOnly.length)}
      ${summaryChip('owned', "You have · they're missing", diff.viewerOnly.length)}
      <span class="bulk-summary-chip">In both <strong>${diff.shared.length}</strong></span>
    </div>`;

  const groups =
    previewGroup('missing', "They have — you're missing", sortedLabels(diff.ownerOnly)) +
    previewGroup('owned', "You have — they're missing", sortedLabels(diff.viewerOnly));

  contentArea.innerHTML = groups
    ? `${summary}<div class="bulk-groups">${groups}</div>`
    : `${summary}<p class="bulk-empty">You both have the same cards.</p>`;
}

/**
 * Open the "Compare Collections" modal: a read-only diff between the shared
 * collection and the viewer's own. Loading the viewer's collection can involve
 * a request, so the modal opens immediately with a loading state.
 */
export async function showCompareModal() {
  const { shell, close, contentArea, buttons } = createCollectionModal({
    title: 'Compare Collections',
    subtitle: 'Loading your collection…',
    actions: [{ id: 'close', text: 'Close' }],
  });
  buttons.close.addEventListener('click', close);
  contentArea.innerHTML = '<p class="bulk-empty">Loading your collection…</p>';
  shell.show();

  // The owner's side is already in `cardState` (loaded with the share token);
  // only the viewer's own collection needs loading.
  const viewerIds = await loadViewerCollection();
  const diff = diffCollections(getOwnedCardIds(), viewerIds, keyFor);

  render(contentArea, shell.modal, diff);
}
