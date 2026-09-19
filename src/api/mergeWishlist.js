import { createMergeClient } from './mergeCollection.js';

/**
 * Additively merge local wishlist printing ids into the signed-in account.
 * @type {(cardIds: string[]) => Promise<Array<{cardId: string, createdAt?: string}>>}
 */
export const mergeWishlistCollection = createMergeClient({
  endpoint: '/.netlify/functions/merge-wishlist',
  label: 'wishlist',
});
