/**
 * Persistence for a signed-out visitor's collections. Each collection mirrors
 * the matching server table but lives in IndexedDB so guests can track cards
 * before they have an account; the records are uploaded (and cleared) on
 * sign-in.
 *
 * `createStore` resolves `null`/`[]`/`false` when IndexedDB is unavailable
 * (jsdom, private mode), so callers keep an in-memory set as the source of
 * truth and treat this module as best-effort persistence.
 */
import { createStore } from '../utils/idb.js';

/**
 * Build the CRUD surface for one IndexedDB-backed collection.
 *
 * @param {{dbName: string, storeName: string}} config
 */
export function createLocalCollection({ dbName, storeName }) {
  const store = createStore({ dbName, storeName, keyPath: 'cardId' });

  /** Every locally-saved record: `{ cardId, addedAt }`. */
  async function load() {
    const rows = await store.getAll();
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) => row && typeof row.cardId === 'string');
  }

  return {
    load,

    /** The locally-tracked printing ids. */
    async getIds() {
      return (await load()).map((row) => row.cardId);
    },

    /**
     * Save (or refresh) a locally-tracked printing.
     * @param {string} cardId
     * @param {string} [addedAt]
     */
    async add(cardId, addedAt = new Date().toISOString()) {
      return store.put({ cardId, addedAt });
    },

    /**
     * Remove one or more locally-tracked printings.
     * @param {Iterable<string>} cardIds
     */
    async remove(cardIds) {
      await Promise.all(Array.from(cardIds, (cardId) => store.remove(cardId)));
    },

    /** Drop the whole local collection (after a successful merge). */
    async clear() {
      return store.clear();
    },
  };
}

const ownedCollection = createLocalCollection({ dbName: 'owned-cards', storeName: 'owned' });

/**
 * Every locally-owned record: `{ cardId, addedAt }`.
 * @returns {Promise<Array<{cardId: string, addedAt?: string}>>}
 */
export const loadLocalCollection = () => ownedCollection.load();

/** The locally-owned printing ids. */
export const getLocalCardIds = () => ownedCollection.getIds();

/** Save (or refresh) a locally-owned printing. */
export const addLocalCard = (cardId, addedAt) => ownedCollection.add(cardId, addedAt);

/** Remove one or more locally-owned printings. */
export const removeLocalCards = (cardIds) => ownedCollection.remove(cardIds);

/** Drop the whole local owned collection (after a successful merge). */
export const clearLocalCollection = () => ownedCollection.clear();
