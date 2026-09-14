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

  async function get(key) {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function put(value) {
    const db = await open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put(value);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function remove(key) {
    const db = await open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).delete(key);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function getAll() {
    const db = await open();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result ?? []);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async function clear() {
    const db = await open();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const transaction = db.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  return { open, get, put, remove, getAll, clear };
}
