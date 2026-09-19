import { getOwnedCardIds } from '../../state/cardState.js';
import { addToViewerWishlist, loadViewerCollection } from '../../state/compareState.js';
import { cardStore, primaryName } from '../../state/cardStore.js';
import { diffCollections } from '../../utils/compareCollections.js';
import { createCollectionModal, previewGroup, summaryChip } from './collectionModal.js';
import { showToast } from './toast.js';

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
    actions: [
      { id: 'wishlist', className: 'primary', text: 'Wishlist missing' },
      { id: 'copy', text: 'Copy names' },
      { id: 'close', text: 'Close' },
    ],
  });
  buttons.close.addEventListener('click', close);
  buttons.wishlist.disabled = true;
  buttons.copy.disabled = true;
  contentArea.innerHTML = '<p class="bulk-empty">Loading your collection…</p>';
  shell.show();

  // The owner's side is already in `cardState` (loaded with the share token);
  // only the viewer's own collection needs loading.
  const ownerIds = getOwnedCardIds();
  const viewerIds = await loadViewerCollection();
  const diff = diffCollections(ownerIds, viewerIds, keyFor);

  render(contentArea, shell.modal, diff);

  // One owner printing id per card they have that the viewer lacks.
  const ownerIdByKey = new Map();
  for (const id of ownerIds) ownerIdByKey.set(keyFor(id), id);
  const missingIds = diff.ownerOnly.map((key) => ownerIdByKey.get(key)).filter(Boolean);

  const nothingMissing = missingIds.length === 0;
  buttons.wishlist.disabled = nothingMissing;
  buttons.copy.disabled = nothingMissing;

  buttons.wishlist.addEventListener('click', async () => {
    buttons.wishlist.disabled = true;
    try {
      await addToViewerWishlist(missingIds);
      buttons.wishlist.textContent = 'Wishlisted';
      showToast(
        `Added ${missingIds.length} card${missingIds.length === 1 ? '' : 's'} to your wishlist.`,
        'success'
      );
    } catch (err) {
      buttons.wishlist.disabled = false;
      console.error('Failed to wishlist the shared collection:', err);
      showToast('Could not update your wishlist.', 'error');
    }
  });

  buttons.copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(sortedLabels(diff.ownerOnly).join('\n'));
      showToast(
        `Copied ${diff.ownerOnly.length} name${diff.ownerOnly.length === 1 ? '' : 's'}.`,
        'success'
      );
    } catch (err) {
      console.error('Failed to copy card names:', err);
      showToast('Could not copy to the clipboard.', 'error');
    }
  });
}
