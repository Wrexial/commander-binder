/**
 * Guest wishlist persistence: the wanted counterpart to `localCollection.js`,
 * stored in its own IndexedDB database so the two collections never collide.
 */
import { createLocalCollection } from './localCollection.js';

const wishlistCollection = createLocalCollection({
  dbName: 'wishlist-cards',
  storeName: 'wishlist',
});

/**
 * Every locally-wanted record: `{ cardId, addedAt }`.
 * @returns {Promise<Array<{cardId: string, addedAt?: string}>>}
 */
export const loadLocalWishlist = () => wishlistCollection.load();

/** The locally-wanted printing ids. */
export const getLocalWishlistIds = () => wishlistCollection.getIds();

/** Save (or refresh) a locally-wanted printing. */
export const addLocalWishlistCard = (cardId, addedAt) => wishlistCollection.add(cardId, addedAt);

/** Remove one or more locally-wanted printings. */
export const removeLocalWishlistCards = (cardIds) => wishlistCollection.remove(cardIds);

/** Drop the whole local wishlist (after a successful merge). */
export const clearLocalWishlist = () => wishlistCollection.clear();
