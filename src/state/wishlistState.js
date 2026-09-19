import { mainState } from './mainState.js';
import { mergeWishlistCollection } from '../api/mergeWishlist.js';
import {
  addLocalWishlistCard,
  clearLocalWishlist,
  loadLocalWishlist,
  removeLocalWishlistCards,
} from './localWishlist.js';
import { createCollectionState } from './collectionState.js';

/**
 * The wanted collection's shared state. It mirrors `cardState.js` (server for
 * signed-in or share-link callers, IndexedDB for guests) and shares its
 * implementation through `createCollectionState`.
 */
const wishlistState = createCollectionState({
  label: 'wishlist',
  readPath: '/.netlify/functions/wishlist-cards',
  togglePath: '/.netlify/functions/toggle-wishlist',
  batchPath: '/.netlify/functions/batch-toggle-wishlist',
  isLocalMode: () => !mainState.loggedInUserId && !mainState.shareToken,
  readBody: () => (mainState.loggedInUserId ? {} : { shareToken: mainState.shareToken }),
  loadLocal: loadLocalWishlist,
  addLocal: addLocalWishlistCard,
  removeLocal: removeLocalWishlistCards,
  clearLocal: clearLocalWishlist,
  mergeToAccount: (cardIds) => mergeWishlistCollection(cardIds),
  canMerge: () => Boolean(mainState.loggedInUserId),
});

export const loadWishlistStates = wishlistState.load;
export const isCardWanted = wishlistState.isPresent;
export const toggleCardWanted = wishlistState.toggle;
export const setCardsWanted = wishlistState.setMany;
export const mergeLocalWishlistToAccount = wishlistState.mergeLocalToAccount;

export function getWantedCardIds() {
  return wishlistState.ids;
}

/** Printing id -> ISO timestamp of when it was marked wanted (best effort). */
export function getWantedAddedAt() {
  return wishlistState.addedAt;
}
