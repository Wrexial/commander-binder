// src/api/cardCache.js
/**
 * Persistent cache of card objects keyed by Scryfall printing id.
 *
 * Binder pockets hydrate through `/cards/collection` (a POST), which Scryfall's
 * HTTP cache headers never cover, so every reload and page navigation used to
 * re-fetch the same cards. This store keeps them on the device instead: the
 * first time a printing is seen it is written here, and later sessions read it
 * back with no network request at all.
 *
 * The TTL mirrors Scryfall's own `Cache-Control: max-age=57600` (16h) on card
 * responses, so a cached copy is at most about a day stale (prices can move).
 * When the network is unavailable a stale copy is still better than a
 * placeholder, so `readCachedCards` can return those on request.
 *
 * Environments without IndexedDB (jsdom, SSR, private mode) fall back to the
 * in-memory Map, so the cache still helps for the lifetime of the page.
 */
import { createStore } from '../utils/idb.js';
import { CACHE_TTL_MS } from './responseCache.js';

/** Upper bound on retained cards (~1 KB each) so the store can't grow forever. */
export const MAX_CACHED_CARDS = 8000;

const store = createStore({ dbName: 'scryfall-cards', storeName: 'cards', keyPath: 'id' });

/** @type {Map<string, {id: string, card: object, ts: number}>} */
const memory = new Map();

/** True when a record exists and is still within the cache TTL. */
export function isCardFresh(record, now = Date.now()) {
  return !!record && now - record.ts < CACHE_TTL_MS;
}

/**
 * Read cached cards for the given printing ids.
 *
 * Fresh records are returned by default; pass `allowStale` to also get records
 * past their TTL (used as an offline fallback). Unknown ids are simply absent
 * from the result.
 *
 * @param {Iterable<string>} ids
 * @param {{allowStale?: boolean, now?: number}} [options]
 * @returns {Promise<Map<string, object>>} id -> card
 */
export async function readCachedCards(ids, { allowStale = false, now = Date.now() } = {}) {
  const wanted = [...new Set(ids || [])].filter((id) => typeof id === 'string' && id);
  const found = new Map();
  const toLoad = [];

  for (const id of wanted) {
    const record = memory.get(id);
    if (record) {
      if (allowStale || isCardFresh(record, now)) found.set(id, record.card);
      continue;
    }
    toLoad.push(id);
  }

  if (toLoad.length === 0) return found;

  const records = await Promise.all(toLoad.map((id) => store.get(id)));
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !record.card) continue;
    memory.set(record.id, record);
    if (allowStale || isCardFresh(record, now)) found.set(record.id, record.card);
  }

  return found;
}

let trimming = false;

/** Drop the oldest records once the store grows past its cap. */
async function trim() {
  if (trimming) return;
  trimming = true;
  try {
    const records = await store.getAll();
    if (records.length <= MAX_CACHED_CARDS) return;

    records
      .sort((a, b) => a.ts - b.ts)
      .slice(0, records.length - MAX_CACHED_CARDS)
      .forEach((record) => {
        memory.delete(record.id);
        void store.remove(record.id);
      });
  } finally {
    trimming = false;
  }
}

/**
 * Persist fetched cards, replacing any older copy of the same printing.
 *
 * @param {object[]} cards
 * @param {number} [now]
 */
export async function writeCachedCards(cards, now = Date.now()) {
  const records = [];
  for (const card of cards || []) {
    if (!card || typeof card.id !== 'string' || !card.id) continue;
    const record = { id: card.id, card, ts: now };
    memory.set(card.id, record);
    records.push(record);
  }
  if (records.length === 0) return;

  await Promise.all(records.map((record) => store.put(record)));
  void trim();
}

/** Forget the in-memory copies (the persistent store is untouched). */
export function clearCardCacheMemory() {
  memory.clear();
}

/** Drop every cached card, in memory and on disk (tests / manual refresh). */
export async function clearCardCache() {
  memory.clear();
  await store.clear();
}
