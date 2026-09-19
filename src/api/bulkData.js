// src/api/bulkData.js
/**
 * Scryfall bulk data client.
 *
 * Scryfall asks clients that need a large amount of card data to use its bulk
 * data files instead of paginating `/cards/search` dozens of times. The files
 * live on the `data.scryfall.io` CDN (not the rate-limited API) and are served
 * as gzip-compressed JSON Lines (`.jsonl.gz`, one card per line), so we can
 * stream, decompress and filter them without buffering the whole archive.
 *
 * `GET /bulk-data` (a single API request) tells us the current download URL and
 * its `updated_at`. We key the cached, filtered subset on that timestamp, so a
 * given day's cards are only downloaded once.
 *
 * Environments without IndexedDB (jsdom, SSR, private mode) degrade to an
 * in-memory cache via the shared `src/utils/idb.js` store wrapper.
 */

import { createStore } from '../utils/idb.js';
import { setCardCatalog } from '../state/cardCatalog.js';

const BULK_INDEX_URL = 'https://api.scryfall.com/bulk-data';

/**
 * `Accept` is a CORS-safelisted header, so this request stays a simple request
 * (no preflight). Do NOT add a `User-Agent` here: browsers don't let pages set
 * it meaningfully, and because it is no longer on the forbidden-header list
 * Firefox turns it into a preflight that the `data.scryfall.io` CDN rejects
 * with a 403 (breaking bulk downloads).
 */
const SCRYFALL_HEADERS = {
  Accept: 'application/json',
};

/** The bulk index changes at most a few times a day; an hour is plenty. */
const INDEX_TTL_MS = 60 * 60 * 1000;

/**
 * How long a downloaded bulk subset is trusted before re-checking Scryfall's
 * index. Bulk files are published about once a day, so a few hours of cache
 * means repeat visits make no network requests at all while still picking up a
 * new file the same day.
 */
export const SUBSET_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * `default_cards` = every English printing (matches the app's current
 * `unique=prints` data). Use `oracle_cards` for a much smaller download that
 * only contains one printing per card.
 */
const DEFAULT_BULK_TYPE = 'default_cards';

// Bump the version suffix whenever the cached subset shape changes (v2 added
// the all-cards name catalog) so stale records are rebuilt instead of reused.
const LEGENDARY_CREATURES_KEY = 'legendary-creatures-v2';

/** @type {{ts: number, entries: Map<string, object>}|null} */
let indexCache = null;
/** @type {Map<string, object>} */
const memorySubsets = new Map();

const store = createStore({
  dbName: 'scryfall-bulk',
  storeName: 'subsets',
  keyPath: 'key',
});

async function readSubset(key) {
  if (memorySubsets.has(key)) return memorySubsets.get(key);

  const record = await store.get(key);
  const value = record?.value ?? null;
  if (value) memorySubsets.set(key, value);
  return value;
}

async function writeSubset(key, value) {
  memorySubsets.set(key, value);

  // Best-effort: ask the browser not to evict this origin's storage.
  requestPersistentStorage();

  const persisted = await store.put({ key, value });
  if (!persisted) console.warn('Failed to persist Scryfall bulk data in IndexedDB.');
  return persisted;
}

let persistenceRequested = false;

/** Ask the browser to keep IndexedDB around (best-effort, never throws). */
function requestPersistentStorage() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    const result = navigator?.storage?.persist?.();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Fetch and memoise the bulk-data index. */
export async function loadBulkIndex({ force = false } = {}) {
  if (!force && indexCache && Date.now() - indexCache.ts < INDEX_TTL_MS) {
    return indexCache.entries;
  }

  const res = await fetch(BULK_INDEX_URL, { headers: SCRYFALL_HEADERS });
  if (!res.ok) throw new Error(`Scryfall bulk-data index failed: HTTP ${res.status}`);

  const body = await res.json();
  const entries = new Map((body.data || []).map((entry) => [entry.type, entry]));
  indexCache = { ts: Date.now(), entries };
  return entries;
}

/** Look up a single bulk-data entry by type. */
export async function getBulkEntry(type = DEFAULT_BULK_TYPE, options = {}) {
  const entries = await loadBulkIndex(options);
  const entry = entries.get(type);
  if (!entry || !entry.jsonl_download_uri) {
    throw new Error(`No Scryfall bulk-data entry of type "${type}"`);
  }
  return entry;
}

/** Matches Scryfall's `type:legendary type:creature` search filter. */
export function isLegendaryCreature(card) {
  if (typeof card?.type_line !== 'string') return false;
  const typeLine = card.type_line.toLowerCase();
  return typeLine.includes('legendary') && typeLine.includes('creature');
}

function isPaper(card) {
  return Array.isArray(card?.games) && card.games.includes('paper');
}

/**
 * Card layouts that are not playable cards. Scryfall's search excludes these by
 * default; we mirror that so the bulk view doesn't include tokens/emblems.
 */
const NON_PLAYABLE_LAYOUTS = new Set([
  'token',
  'double_faced_token',
  'emblem',
  'art_series',
  'vanguard',
  'scheme',
  'planar',
  'augment',
  'host',
]);

/**
 * A paper, playable legendary creature. Bulk data carries tokens and other
 * non-playable layouts the search hides, so we drop those. We deliberately do
 * NOT try to mirror every default-search exclusion (e.g. Un-sets): that is
 * set-specific and fragile, and would drop cards the app shows today. The
 * coverage script reports the resulting delta.
 *
 * @param {object} card
 * @returns {boolean}
 */
export function isPlayableLegendaryCreature(card) {
  if (!isLegendaryCreature(card) || !isPaper(card)) return false;
  if (NON_PLAYABLE_LAYOUTS.has(card.layout)) return false;
  return true;
}

function* splitLines(text) {
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line) yield line;
  }
}

/**
 * Yield the parsed JSON value of each line in a bulk-data response, streaming
 * through gzip decompression where needed.
 *
 * @param {object} response A fetch `Response` (or a compatible mock).
 * @returns {AsyncGenerator<string>} trimmed, non-empty JSONL lines
 */
export async function* readJsonlLines(response) {
  const contentType = response?.headers?.get?.('content-type') || '';
  const url = response?.url || '';
  const gzipped = /gzip/i.test(contentType) || /\.gz(\?|#|$)/i.test(url);

  const body = response?.body;
  if (!body || typeof body.pipeThrough !== 'function') {
    // No stream (e.g. a simple test mock): fall back to a single decode.
    yield* splitLines((await response.text()) || '');
    return;
  }

  let stream = body;
  if (gzipped) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error(
        'Scryfall bulk data is gzip-compressed and this browser cannot decompress it.'
      );
    }
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }

  if (typeof TextDecoderStream === 'undefined') {
    // Older runtimes: buffer and decode once.
    const buffer = await new Response(stream).arrayBuffer();
    yield* splitLines(new TextDecoder().decode(buffer));
    return;
  }

  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield line;
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  const tail = buffer.trim();
  if (tail) yield tail;
}

/**
 * Download a bulk file and keep only the cards that satisfy `predicate`.
 * The archive is streamed, so peak memory stays bounded by the matches.
 *
 * @param {string} type Bulk type, e.g. `default_cards`.
 * @param {(card: object) => boolean} predicate
 * @param {{entry?: object, onProgress?: (received: number) => void, onCard?: (card: object) => void}} [options]
 * @returns {Promise<{updatedAt: string, cards: object[]}>}
 */
export async function downloadFilteredBulkCards(type, predicate, options = {}) {
  const entry = options.entry || (await getBulkEntry(type));
  // No custom headers here: a preflight against data.scryfall.io is rejected
  // (403, no CORS headers), which used to break the whole bulk download.
  const res = await fetch(entry.jsonl_download_uri);
  if (!res.ok) throw new Error(`Scryfall bulk download failed: HTTP ${res.status}`);

  const cards = [];
  let lineCount = 0;
  for await (const line of readJsonlLines(res)) {
    lineCount++;
    if (options.onProgress && lineCount % 500 === 0) options.onProgress(lineCount);
    // A large file arrives in many chunks; yield to the event loop so the UI
    // stays responsive while we parse it on the main thread.
    if (lineCount % 2000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    let card;
    try {
      card = JSON.parse(line);
    } catch {
      continue; // skip a malformed line rather than aborting the whole file
    }
    // Every parsed card is offered to the caller (used to build the all-cards
    // name catalog for free while the same stream runs).
    options.onCard?.(card);
    if (predicate(card)) cards.push(card);
  }

  return { updatedAt: entry.updated_at, cards };
}

/**
 * Sanity-check that a bulk subset actually covers the set the search API
 * reports. The search's `total_cards` is the ground truth and page 1 gives a
 * cheap sample of ids to spot-check membership.
 *
 * @param {object[]} cards The filtered bulk subset.
 * @param {{expectedCount?: number|null, sampleIds?: string[]|null, tolerance?: number}} [options]
 * @returns {{ok: boolean, count: number, expectedCount: number|null, countMatches: boolean, missingSampleIds: string[]}}
 */
export function verifyBulkCoverage(
  cards,
  { expectedCount = null, sampleIds = null, tolerance = 0 } = {}
) {
  const ids = new Set((cards || []).map((card) => card.id));
  const missingSampleIds = [];
  if (Array.isArray(sampleIds)) {
    for (const id of sampleIds) {
      if (!ids.has(id)) missingSampleIds.push(id);
    }
  }

  const count = Array.isArray(cards) ? cards.length : 0;
  const countMatches =
    typeof expectedCount !== 'number' || Math.abs(count - expectedCount) <= tolerance;

  return {
    ok: missingSampleIds.length === 0 && countMatches,
    count,
    expectedCount: typeof expectedCount === 'number' ? expectedCount : null,
    countMatches,
    missingSampleIds,
  };
}

/** Publish a subset's all-cards name catalog for the picker/compare tools. */
function publishCardCatalog(subset) {
  if (!subset) return;
  setCardCatalog({
    cardNames: subset.cardNames,
    cardNameById: subset.cardNameById,
    cardIdByName: subset.cardIdByName,
  });
}

/**
 * Return every paper legendary-creature printing, sorted by release date to
 * match the app's `order=released&dir=asc` view. Cached in IndexedDB and
 * reused for {@link SUBSET_TTL_MS} before Scryfall's index is re-checked.
 *
 * The same stream also builds the all-cards name catalog (`cardNames` /
 * `cardNameById`) for free, so the Binder Builder picker and the compare tools
 * have every card name without downloading anything extra.
 *
 * @param {{type?: string, force?: boolean}} [options]
 * @returns {Promise<{updatedAt: string, type: string, fetchedAt: number, cards: object[], cardNames?: string[], cardNameById?: object}>}
 */
export async function getLegendaryCreatures({ type = DEFAULT_BULK_TYPE, force = false } = {}) {
  const cacheKey = `${type}:${LEGENDARY_CREATURES_KEY}`;
  const cached = await readSubset(cacheKey);

  // Fast path: a subset downloaded within the TTL is served with no network
  // request at all (not even the bulk index).
  if (
    !force &&
    cached &&
    Array.isArray(cached.cards) &&
    Date.now() - (cached.fetchedAt || 0) < SUBSET_TTL_MS
  ) {
    publishCardCatalog(cached);
    return cached;
  }

  let entry;
  try {
    entry = await getBulkEntry(type, { force });
  } catch (err) {
    // Offline or rate-limited index: a stale subset beats no cards at all.
    if (cached && Array.isArray(cached.cards)) {
      console.warn('Scryfall bulk index unavailable; using cached bulk data.', err);
      publishCardCatalog(cached);
      return cached;
    }
    throw err;
  }

  if (!force && cached && cached.updatedAt === entry.updated_at && Array.isArray(cached.cards)) {
    // Unchanged upstream: extend the freshness window without re-downloading.
    const refreshed = { ...cached, fetchedAt: Date.now() };
    await writeSubset(cacheKey, refreshed);
    publishCardCatalog(refreshed);
    return refreshed;
  }

  const cardNames = new Set();
  const cardNameById = {};
  const cardIdByName = {};
  const { updatedAt, cards } = await downloadFilteredBulkCards(type, isPlayableLegendaryCreature, {
    entry,
    // Every card in the file contributes its front-face name, not just the
    // legendary creatures we keep below.
    onCard: (card) => {
      if (!card || typeof card.name !== 'string' || !card.name) return;
      const front = card.name.split(' // ')[0];
      if (!front) return;
      cardNames.add(front);
      const id = typeof card.id === 'string' ? card.id : null;
      if (!id) return;
      cardNameById[id] = front;
      const key = front.toLowerCase();
      if (!(key in cardIdByName)) cardIdByName[key] = id;
    },
  });
  cards.sort((a, b) => String(a.released_at || '').localeCompare(String(b.released_at || '')));

  const subset = {
    updatedAt,
    type,
    fetchedAt: Date.now(),
    cards,
    cardNames: [...cardNames].sort((a, b) => a.localeCompare(b)),
    cardNameById,
    cardIdByName,
  };
  await writeSubset(cacheKey, subset);
  publishCardCatalog(subset);
  return subset;
}

/** Drop every cached subset and the memoised index (used by tests/manual refresh). */
export async function clearBulkCache() {
  indexCache = null;
  memorySubsets.clear();
  await store.clear();
}
