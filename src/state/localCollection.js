/**
 * Persistence for a signed-out visitor's collection. It mirrors the server's
 * `owned_cards` store but lives in IndexedDB so guests can mark cards before
 * they have an account; the records are uploaded (and cleared) on sign-in.
 *
 * `createStore` resolves `null`/`[]`/`false` when IndexedDB is unavailable
 * (jsdom, private mode), so callers keep an in-memory set as the source of
 * truth and treat this module as best-effort persistence.
 */
import { createStore } from '../utils/idb.js';

const store = createStore({ dbName: 'owned-cards', storeName: 'owned', keyPath: 'cardId' });

/**
 * Every locally-saved record: `{ cardId, addedAt }`.
 * @returns {Promise<Array<{cardId: string, addedAt?: string}>>}
 */
export async function loadLocalCollection() {
  const rows = await store.getAll();
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row.cardId === 'string');
}

/** The locally-owned printing ids. */
export async function getLocalCardIds() {
  return (await loadLocalCollection()).map((row) => row.cardId);
}

/**
 * Save (or refresh) a locally-owned printing.
 * @param {string} cardId
 * @param {string} [addedAt]
 */
export async function addLocalCard(cardId, addedAt = new Date().toISOString()) {
  return store.put({ cardId, addedAt });
}

/**
 * Remove one or more locally-owned printings.
 * @param {Iterable<string>} cardIds
 */
export async function removeLocalCards(cardIds) {
  await Promise.all(Array.from(cardIds, (cardId) => store.remove(cardId)));
}

/** Drop the whole local collection (after a successful merge). */
export async function clearLocalCollection() {
  return store.clear();
}
