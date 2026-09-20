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
import { createLocalRecordStore } from './localRecordStore.js';

/**
 * Build the CRUD surface for one IndexedDB-backed collection.
 *
 * @param {{dbName: string, storeName: string}} config
 */
export function createLocalCollection({ dbName, storeName }) {
  const store = createLocalRecordStore({
    dbName,
    storeName,
    keyPath: 'cardId',
    isValid: (row) => row && typeof row.cardId === 'string',
  });

  return {
    /** Every locally-saved record: `{ cardId, addedAt }`. */
    load: () => store.load(),

    /** The locally-tracked printing ids. */
    async getIds() {
      return (await store.load()).map((row) => row.cardId);
    },

    /**
     * Save (or refresh) a locally-tracked printing.
     * @param {string} cardId
     * @param {string} [addedAt]
     */
    add: (cardId, addedAt = new Date().toISOString()) => store.put({ cardId, addedAt }),

    /**
     * Remove one or more locally-tracked printings.
     * @param {Iterable<string>} cardIds
     */
    async remove(cardIds) {
      await Promise.all(Array.from(cardIds, (cardId) => store.remove(cardId)));
    },

    /** Drop the whole local collection (after a successful merge). */
    clear: () => store.clear(),
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
