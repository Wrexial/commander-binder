/**
 * Minimal promise wrapper around a single IndexedDB object store.
 *
 * Both the Scryfall response cache and the bulk-data cache need the same
 * open/read/write/delete/clear plumbing. Environments without IndexedDB
 * (jsdom, SSR, private-mode fallbacks) resolve to `null`, so callers degrade
 * gracefully to memory-only caching.
 *
 * @param {{dbName: string, storeName: string, keyPath?: string, version?: number}} config
 */
export function createStore({ dbName, storeName, keyPath = 'key', version = 1 }) {
  /** @type {Promise<IDBDatabase|null>|null} */
  let dbPromise = null;

  function getIndexedDB() {
    return typeof indexedDB !== 'undefined' && indexedDB ? indexedDB : null;
  }

  function open() {
    if (dbPromise) return dbPromise;

    const idb = getIndexedDB();
    if (!idb) {
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }

    dbPromise = new Promise((resolve) => {
      let request;
      try {
        request = idb.open(dbName, version);
      } catch {
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });

    return dbPromise;
  }

  /**
   * Resolve `fallback` when the database is unavailable (no IndexedDB, blocked
   * upgrade, private mode) or the store itself throws.
   *
   * @param {string} mode 'readonly' | 'readwrite'
   * @param {(store: IDBObjectStore) => IDBRequest} run
   * @param {unknown} fallback value used when the database cannot be reached
   * @returns {Promise<unknown>}
   */
  function request(mode, run, fallback) {
    return open().then((db) => {
      if (!db) return fallback;

      return new Promise((resolve) => {
        let result;
        try {
          result = run(db.transaction(storeName, mode).objectStore(storeName));
        } catch {
          resolve(fallback);
          return;
        }

        result.onsuccess = () => resolve(result.result ?? fallback);
        result.onerror = () => resolve(fallback);
      });
    });
  }

  /**
   * Run a write and settle when its transaction completes, not when the request
   * does — a `put` that fails its constraint check still completes silently.
   *
   * @param {(store: IDBObjectStore) => void} run
   * @param {unknown} ok value resolved on success
   * @param {unknown} failed value resolved on failure
   * @returns {Promise<unknown>}
   */
  function write(run, ok, failed) {
    return open().then((db) => {
      if (!db) return failed;

      return new Promise((resolve) => {
        let transaction;
        try {
          transaction = db.transaction(storeName, 'readwrite');
          run(transaction.objectStore(storeName));
        } catch {
          resolve(failed);
          return;
        }

        transaction.oncomplete = () => resolve(ok);
        transaction.onerror = () => resolve(failed);
        transaction.onabort = () => resolve(failed);
      });
    });
  }

  async function get(key) {
    return request('readonly', (store) => store.get(key), null);
  }

  async function getAll() {
    return request('readonly', (store) => store.getAll(), []);
  }

  async function put(value) {
    return write((store) => store.put(value), true, false);
  }

  async function remove(key) {
    return write((store) => store.delete(key), true, false);
  }

  async function clear() {
    return write((store) => store.clear(), undefined, undefined);
  }

  return { get, put, remove, getAll, clear };
}
