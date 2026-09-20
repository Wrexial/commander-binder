/**
 * Shared IndexedDB CRUD surface for the device-local registries (owned/wishlist
 * cards, custom lists, binders).
 *
 * `createStore` resolves `null`/`[]`/`false` when IndexedDB is unavailable
 * (jsdom, private mode), so callers keep an in-memory copy as the source of
 * truth and treat this module as best-effort persistence.
 */
import { createStore } from '../utils/idb.js';

/**
 * @param {object} config
 * @param {string} config.dbName
 * @param {string} config.storeName
 * @param {string} [config.keyPath] Record key (defaults to `id`).
 * @param {(row: object) => boolean} [config.isValid] Drops malformed rows on load.
 */
export function createLocalRecordStore({ dbName, storeName, keyPath = 'id', isValid }) {
  const store = createStore({ dbName, storeName, keyPath });

  /** Every locally-saved record (malformed rows dropped). */
  async function load() {
    const rows = await store.getAll();
    if (!Array.isArray(rows)) return [];
    return isValid ? rows.filter(isValid) : rows;
  }

  return {
    load,
    put: (record) => store.put(record),
    remove: (key) => store.remove(key),
    clear: () => store.clear(),
  };
}
