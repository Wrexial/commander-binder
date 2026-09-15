/**
 * Minimal in-memory stand-in for the slice of IndexedDB that `utils/idb.js`
 * touches. jsdom ships no IndexedDB at all, so the database-backed branches of
 * the cache stores would otherwise never run under test.
 *
 * Requests/handlers are settled on a microtask, matching the real API's
 * requirement that callers attach `onsuccess`/`oncomplete` after the call.
 */

class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onupgradeneeded = null;
    this.onsuccess = null;
    this.onerror = null;
    this.onblocked = null;
  }
}

class FakeObjectStore {
  constructor(name, keyPath) {
    this.name = name;
    this.keyPath = keyPath;
    this.records = new Map();
    this.transaction = null;
  }

  /** Snapshot values so callers cannot mutate the store through returned refs. */
  #clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  get(key) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      request.result = this.#clone(this.records.get(key));
      request.onsuccess?.();
    });
    return request;
  }

  getAll() {
    const request = new FakeRequest();
    queueMicrotask(() => {
      request.result = [...this.records.values()].map((value) => this.#clone(value));
      request.onsuccess?.();
    });
    return request;
  }

  put(value) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.records.set(value[this.keyPath], this.#clone(value));
      request.result = value[this.keyPath];
      request.onsuccess?.();
      this.transaction?.oncomplete?.();
    });
    return request;
  }

  delete(key) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.records.delete(key);
      request.onsuccess?.();
      this.transaction?.oncomplete?.();
    });
    return request;
  }

  clear() {
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.records.clear();
      request.onsuccess?.();
      this.transaction?.oncomplete?.();
    });
    return request;
  }
}

class FakeTransaction {
  constructor(store) {
    this.store = store;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    store.transaction = this;
  }

  objectStore() {
    return this.store;
  }
}

class FakeDatabase {
  constructor({ failTransaction = false } = {}) {
    this.stores = new Map();
    this.failTransaction = failTransaction;
  }

  get objectStoreNames() {
    return { contains: (name) => this.stores.has(name) };
  }

  createObjectStore(name, { keyPath }) {
    const store = new FakeObjectStore(name, keyPath);
    this.stores.set(name, store);
    return store;
  }

  transaction(name) {
    if (this.failTransaction) throw new Error('store unavailable');
    const store = this.stores.get(name);
    if (!store) throw new Error(`Unknown store: ${name}`);
    return new FakeTransaction(store);
  }
}

/**
 * Install a fake `indexedDB` global.
 *
 * @param {{throwOnOpen?: boolean, throwOnTransaction?: boolean}} [options]
 * @returns {{restore: () => void, openCount: () => number}}
 */
export function installFakeIndexedDB({ throwOnOpen = false, throwOnTransaction = false } = {}) {
  const database = new FakeDatabase({ failTransaction: throwOnTransaction });
  let opens = 0;
  const original = globalThis.indexedDB;

  globalThis.indexedDB = {
    open() {
      opens += 1;
      if (throwOnOpen) throw new Error('IndexedDB is unavailable');

      const request = new FakeRequest();
      queueMicrotask(() => {
        request.result = database;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };

  return {
    openCount: () => opens,
    restore: () => {
      if (original === undefined) delete globalThis.indexedDB;
      else globalThis.indexedDB = original;
    },
  };
}
