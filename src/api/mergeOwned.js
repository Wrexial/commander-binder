import { createMergeClient } from './mergeCollection.js';

/**
 * Additively merge local owned printing ids into the signed-in account.
 * @type {(cardIds: string[]) => Promise<Array<{cardId: string, createdAt?: string}>>}
 */
export const mergeOwnedCollection = createMergeClient({
  endpoint: '/.netlify/functions/merge-owned',
  label: 'collection',
});
