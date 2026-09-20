import { getOwnedCardIds } from '../../state/cardState.js';
import { addToViewerWishlist, loadViewerCollection } from '../../state/compareState.js';
import { resolveCatalogName } from '../../state/cardCatalog.js';
import { cardStore, primaryName } from '../../state/cardStore.js';
import { getListCardIds } from '../../state/listsState.js';
import { mainState } from '../../state/mainState.js';
import { setCardsWanted } from '../../state/wishlistState.js';
import { diffCollections } from '../../utils/compareCollections.js';
import { updateAllCardStates } from '../cards.js';
import { createCollectionModal, previewGroup, summaryChip } from './collectionModal.js';
import { attachCardPreview } from './cardPreview.js';
import { showToast } from './toast.js';

/**
 * A comparison key for a printing id: the card's name when the printing is
 * loaded (so different printings of one card count once), else the all-cards
 * catalog name, otherwise the raw id so an unloaded card never silently
 * disappears from the diff.
 */
function keyFor(id) {
  const card = cardStore.getByPrintingId(id);
  if (card) return primaryName(card);
  return resolveCatalogName(id) || id;
}

/** A display label for a comparison key. */
function labelFor(key) {
  const byId = cardStore.getByPrintingId(key);
  if (byId) return byId.name;
  const oldest = cardStore.getOldestPrinting(key);
  if (oldest) return oldest.name;
  return resolveCatalogName(key) || key;
}

function sortedLabels(keys) {
  return keys.map(labelFor).sort((a, b) => a.localeCompare(b));
}

/** A previewable `{name, id}` entry for a comparison key, when the card is loaded. */
function entryFor(key) {
  const card = cardStore.getByPrintingId(key) || cardStore.getOldestPrinting(key);
  if (card) return { name: card.name, id: card.id };
  return { name: resolveCatalogName(key) || key };
}

/** Like `sortedLabels`, but keeps the printing id so each row can preview. */
function sortedEntries(keys) {
  return keys.map(entryFor).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Paint a two-sided diff into a collection modal.
 *
 * @param {HTMLElement} contentArea
 * @param {HTMLElement} modal
 * @param {{ ownerOnly: string[], viewerOnly: string[], shared: string[] }} diff
 * @param {{subtitle: string, chipLeft: string, chipRight: string, groupLeft: string, groupRight: string, empty: string}} labels
 */
function render(contentArea, modal, diff, labels) {
  const subtitle = modal.querySelector('.bulk-modal-subtitle');
  if (subtitle) subtitle.textContent = labels.subtitle;

  const summary = `
    <div class="bulk-summary">
      ${summaryChip('missing', labels.chipLeft, diff.ownerOnly.length)}
      ${summaryChip('owned', labels.chipRight, diff.viewerOnly.length)}
      <span class="bulk-summary-chip">In both <strong>${diff.shared.length}</strong></span>
    </div>`;

  const groups =
    previewGroup('missing', labels.groupLeft, sortedEntries(diff.ownerOnly)) +
    previewGroup('owned', labels.groupRight, sortedEntries(diff.viewerOnly));

  contentArea.innerHTML = groups
    ? `${summary}<div class="bulk-groups">${groups}</div>`
    : `${summary}<p class="bulk-empty">${labels.empty}</p>`;
}

/**
 * Paint a list-vs-collection diff: the list cards you have and don't have, plus
 * the cards you own that aren't on the list at all.
 *
 * @param {HTMLElement} contentArea
 * @param {HTMLElement} modal
 * @param {{ ownerOnly: string[], viewerOnly: string[], shared: string[] }} diff
 */
function renderListCompare(contentArea, modal, diff) {
  const missing = sortedEntries(diff.ownerOnly); // on the list, not owned
  const have = sortedEntries(diff.shared); // on the list and owned
  const extra = sortedEntries(diff.viewerOnly); // owned, but not on the list

  const subtitle = modal.querySelector('.bulk-modal-subtitle');
  if (subtitle) subtitle.textContent = `${have.length} you have · ${missing.length} you don't`;

  // An empty list would otherwise dump the whole collection into "not on the list".
  if (have.length === 0 && missing.length === 0) {
    contentArea.innerHTML = '<p class="bulk-empty">This list has no cards yet.</p>';
    return;
  }

  const summary = `
    <div class="bulk-summary">
      ${summaryChip('owned', 'You have', have.length)}
      ${summaryChip('missing', "You don't have", missing.length)}
      ${summaryChip('unknown', 'You own · not on the list', extra.length)}
    </div>`;

  const groups =
    previewGroup('missing', "You don't have", missing) +
    previewGroup('owned', 'You have', have) +
    previewGroup('unknown', 'You own — not on the list', extra);

  contentArea.innerHTML = `${summary}<div class="bulk-groups">${groups}</div>`;
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
  attachCardPreview(contentArea);
  contentArea.innerHTML = '<p class="bulk-empty">Loading your collection…</p>';
  shell.show();

  // The owner's side is already in `cardState` (loaded with the share token);
  // only the viewer's own collection needs loading.
  const ownerIds = getOwnedCardIds();
  const viewerIds = await loadViewerCollection();
  const diff = diffCollections(ownerIds, viewerIds, keyFor);

  render(contentArea, shell.modal, diff, {
    subtitle:
      `${diff.ownerOnly.length} they have that you're missing · ` +
      `${diff.viewerOnly.length} you have that they're missing`,
    chipLeft: "They have · you're missing",
    chipRight: "You have · they're missing",
    groupLeft: "They have — you're missing",
    groupRight: "You have — they're missing",
    empty: 'You both have the same cards.',
  });

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

/**
 * Compare a custom list against the viewer's own collection: what is on the
 * list but missing from the collection, and what is in the collection but not
 * on the list. Works signed in, signed out and in a share view (where the
 * viewer's own collection is loaded separately from the owner's).
 *
 * @param {{ id: string, name: string }} list
 */
export async function showListCompareModal(list) {
  const listIds = getListCardIds(list.id);

  const { shell, close, contentArea, buttons } = createCollectionModal({
    title: `Compare “${list.name}”`,
    subtitle: 'Loading your collection…',
    actions: [
      { id: 'wishlist', className: 'primary', text: 'Wishlist missing' },
      { id: 'copy', text: 'Copy list' },
      { id: 'close', text: 'Close' },
    ],
  });
  buttons.close.addEventListener('click', close);
  buttons.wishlist.disabled = true;
  buttons.copy.disabled = true;
  attachCardPreview(contentArea);
  contentArea.innerHTML = '<p class="bulk-empty">Loading your collection…</p>';
  shell.show();

  // In a share view `cardState` is the owner, so the viewer's own collection
  // has to be fetched separately; otherwise it already is the current user's.
  const collectionIds = mainState.shareToken ? await loadViewerCollection() : getOwnedCardIds();
  const diff = diffCollections(listIds, collectionIds, keyFor);

  renderListCompare(contentArea, shell.modal, diff);

  // One list printing id per card key, for the wishlist action.
  const listIdByKey = new Map();
  for (const id of listIds) listIdByKey.set(keyFor(id), id);
  const missingIds = diff.ownerOnly.map((key) => listIdByKey.get(key)).filter(Boolean);

  buttons.wishlist.disabled = missingIds.length === 0;
  buttons.copy.disabled = listIds.length === 0;

  buttons.wishlist.addEventListener('click', async () => {
    buttons.wishlist.disabled = true;
    try {
      if (mainState.shareToken) {
        await addToViewerWishlist(missingIds);
      } else {
        // The viewer *is* the current user, so update the live wishlist too.
        await setCardsWanted(
          missingIds.map((id) => ({ id })),
          true
        );
        updateAllCardStates();
      }
      buttons.wishlist.textContent = 'Wishlisted';
      showToast(
        `Added ${missingIds.length} card${missingIds.length === 1 ? '' : 's'} to your wishlist.`,
        'success'
      );
    } catch (err) {
      buttons.wishlist.disabled = false;
      console.error('Failed to wishlist the list:', err);
      showToast('Could not update your wishlist.', 'error');
    }
  });

  buttons.copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(sortedLabels(listIds.map(keyFor)).join('\n'));
      showToast(`Copied ${listIds.length} name${listIds.length === 1 ? '' : 's'}.`, 'success');
    } catch (err) {
      console.error('Failed to copy the list names:', err);
      showToast('Could not copy to the clipboard.', 'error');
    }
  });
}
