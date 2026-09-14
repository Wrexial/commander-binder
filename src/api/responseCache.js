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
import { createStore } from '../utils/idb.js';

// 16 hours, matching Scryfall's `max-age=57600`.
export const CACHE_TTL_MS = 57600 * 1000;

const MAX_ENTRIES = 150;

const store = createStore({
  dbName: 'scryfall-cache',
  storeName: 'responses',
  keyPath: 'url',
});

/** @type {Map<string, {url: string, data: unknown, etag: string|null, ts: number}>} */
const memory = new Map();

/** Keep the persistent store bounded; drops the oldest records first. */
async function trimIdb() {
  const records = await store.getAll();
  if (records.length <= MAX_ENTRIES) return;
  records
    .sort((a, b) => a.ts - b.ts)
    .slice(0, records.length - MAX_ENTRIES)
    .forEach((record) => store.remove(record.url));
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

  const record = await store.get(url);
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
  await store.put(record);
  void trimIdb();
  return record;
}

/** Clear all cached responses (used by tests and manual refresh). */
export async function clearCache() {
  memory.clear();
  await store.clear();
}
