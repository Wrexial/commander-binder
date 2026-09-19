import { authenticatedFetch } from './authenticatedFetch.js';

const ENDPOINT = '/.netlify/functions/merge-wishlist';

/** Matches the server's `MAX_BATCH_SIZE` so one request never exceeds the cap. */
const MERGE_CHUNK_SIZE = 500;

/**
 * Additively merge local wishlist ids into the signed-in account. The payload
 * is chunked because a real wishlist can exceed the server's per-request cap,
 * and the first failure aborts so the caller keeps the local records for a
 * later retry (the merge is an idempotent union, so re-sending is safe).
 *
 * @param {string[]} cardIds
 * @returns {Promise<Array<{cardId: string, createdAt?: string}>>} the merged wishlist
 */
export async function mergeWishlistCollection(cardIds) {
  let wishlist = [];

  for (let i = 0; i < cardIds.length; i += MERGE_CHUNK_SIZE) {
    const chunk = cardIds.slice(i, i + MERGE_CHUNK_SIZE);
    const res = await authenticatedFetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ cardIds: chunk }),
    });

    if (!res.ok) {
      throw new Error(`Failed to merge wishlist (${res.status})`);
    }

    wishlist = await res.json();
  }

  return wishlist;
}
