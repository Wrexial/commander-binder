// src/api/responseCache.js
/**
 * Persistent response cache for Scryfall API GET requests.
 *
 * Scryfall serves search responses with `Cache-Control: public, max-age=57600`
 * (16 hours) and an `ETag`, so we mirror that lifetime here. Records are kept in
 * an in-memory Map (hot path) backed by IndexedDB (survives reloads).
 *
 * Environments without IndexedDB (jsdom, SSR, private-mode fallbacks) degrade
 * gracefully to memory-only caching.
 */

// 16 hours, matching Scryfall's `max-age=57600`.
export const CACHE_TTL_MS = 57600 * 1000;

const DB_NAME = 'scryfall-cache';
const STORE_NAME = 'responses';
const DB_VERSION = 1;
const MAX_ENTRIES = 150;

/** @type {Map<string, {url: string, data: unknown, etag: string|null, ts: number}>} */
const memory = new Map();

/** @type {Promise<IDBDatabase|null>|null} */
let dbPromise = null;

function getIndexedDB() {
  return typeof indexedDB !== 'undefined' && indexedDB ? indexedDB : null;
}

function openDb() {
  if (dbPromise) return dbPromise;

  const idb = getIndexedDB();
  if (!idb) {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = idb.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function readFromIdb(url) {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(url);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

function writeToIdb(record) {
  return openDb().then((db) => {
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  });
}

function deleteFromIdb(url) {
  return openDb().then((db) => {
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(url);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  });
}

/** Keep the persistent store bounded; drops the oldest records first. */
async function trimIdb() {
  const db = await openDb();
  if (!db) return;
  try {
    const records = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    if (records.length <= MAX_ENTRIES) return;
    records
      .sort((a, b) => a.ts - b.ts)
      .slice(0, records.length - MAX_ENTRIES)
      .forEach((rec) => deleteFromIdb(rec.url));
  } catch {
    /* best-effort cleanup only */
  }
}

/** True when a record exists and is still within its TTL. */
export function isFresh(record, now = Date.now()) {
  return !!record && now - record.ts < CACHE_TTL_MS;
}

/**
 * Read a cached response. Returns the record (which may be stale) or null.
 * @returns {Promise<{url: string, data: unknown, etag: string|null, ts: number}|null>}
 */
export async function readCache(url) {
  const mem = memory.get(url);
  if (mem) return mem;

  const record = await readFromIdb(url);
  if (record) memory.set(url, record);
  return record;
}

/**
 * Persist a response. `ts` is overridable for tests.
 * @returns {Promise<{url: string, data: unknown, etag: string|null, ts: number}>}
 */
export async function writeCache(url, data, etag = null, ts = Date.now()) {
  const record = { url, data, etag: etag || null, ts };
  memory.set(url, record);
  await writeToIdb(record);
  trimIdb();
  return record;
}

/** Remove a single entry from both layers. */
export async function removeCache(url) {
  memory.delete(url);
  await deleteFromIdb(url);
}

/** Clear all cached responses (used by tests and manual refresh). */
export async function clearCache() {
  memory.clear();
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
