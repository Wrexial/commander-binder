import { mainState } from './mainState.js';
import { mergeOwnedCollection } from '../api/mergeOwned.js';
import {
  addLocalCard,
  clearLocalCollection,
  loadLocalCollection,
  removeLocalCards,
} from './localCollection.js';
import { createCollectionState } from './collectionState.js';

/**
 * The owned collection's shared state: signed-in callers and share-link guests
 * load from the server, signed-out visitors from IndexedDB. The wishlist uses
 * the same machinery in `wishlistState.js`.
 */
const ownedState = createCollectionState({
  label: 'owned cards',
  readPath: '/.netlify/functions/owned-cards',
  togglePath: '/.netlify/functions/toggle-card',
  batchPath: '/.netlify/functions/batch-toggle-cards',
  isLocalMode: () => !mainState.loggedInUserId && !mainState.shareToken,
  readBody: () => (mainState.loggedInUserId ? {} : { shareToken: mainState.shareToken }),
  loadLocal: loadLocalCollection,
  addLocal: addLocalCard,
  removeLocal: removeLocalCards,
  clearLocal: clearLocalCollection,
  mergeToAccount: (cardIds) => mergeOwnedCollection(cardIds),
  canMerge: () => Boolean(mainState.loggedInUserId),
});

export const loadCardStates = ownedState.load;
export const isCardOwned = ownedState.isPresent;
export const toggleCardOwned = ownedState.toggle;
export const setCardsOwned = ownedState.setMany;
export const mergeLocalCollectionToAccount = ownedState.mergeLocalToAccount;

export function getOwnedCardIds() {
  return ownedState.ids;
}

/**
 * Printing id -> ISO timestamp of when it was marked owned. Used by the
 * "Recent additions" log; entries are absent for cards loaded before this was
 * tracked or when the server did not report a time.
 */
export function getOwnedAddedAt() {
  return ownedState.addedAt;
}
