import { authenticatedFetch } from './authenticatedFetch.js';

/** Matches the server's `MAX_BATCH_SIZE` so one request never exceeds the cap. */
const MERGE_CHUNK_SIZE = 500;

/**
 * Build the client for one collection's merge endpoint (owned or wishlist).
 *
 * The payload is chunked because a real collection can exceed the server's
 * per-request cap, and the first failure aborts so the caller keeps the local
 * records for a later retry (the merge is an idempotent union, so re-sending is
 * safe).
 *
 * @param {{endpoint: string, label: string}} config
 * @returns {(cardIds: string[]) => Promise<Array<{cardId: string, createdAt?: string}>>} the merged collection
 */
export function createMergeClient({ endpoint, label }) {
  return async function mergeCollection(cardIds) {
    let collection = [];

    for (let i = 0; i < cardIds.length; i += MERGE_CHUNK_SIZE) {
      const chunk = cardIds.slice(i, i + MERGE_CHUNK_SIZE);
      const res = await authenticatedFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ cardIds: chunk }),
      });

      if (!res.ok) {
        throw new Error(`Failed to merge ${label} (${res.status})`);
      }

      collection = await res.json();
    }

    return collection;
  };
}
