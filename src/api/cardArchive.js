// src/api/cardArchive.js
/**
 * Local, compressed archive of every English printing, built for free while the
 * Scryfall `default_cards` bulk file is streamed for the legendary subset and
 * name catalog (see `api/bulkData.js`).
 *
 * The bulk file is ~633 MB of JSON, so instead of holding it we write it out in
 * fixed-size members, each gzip-compressed, and keep a printing id → member
 * index alongside. A lookup decompresses only the member(s) it needs, and an
 * LRU keeps the hottest members parsed in memory.
 *
 * This is what lets the Binder Builder resolve *any* card — and its full
 * printing list — without a single Scryfall request. It is opt-in (the
 * `preloadCards` setting) because the compressed archive is a few tens of MB;
 * without it the app falls back to the on-demand `/cards/collection` +
 * `/cards/search` path.
 */
import { createStore } from '../utils/idb.js';

/** Bump to force a rebuild when the stored shape changes. */
export const ARCHIVE_VERSION = 1;

/** Printings per compressed member. Small enough to decompress on demand. */
export const MEMBER_SIZE = 1000;

/** Decompressed members kept in memory (each ~1 MB, so this is bounded). */
const MEMBER_CACHE_LIMIT = 6;

/** Members allowed to be waiting on disk before the builder pauses the stream. */
const MAX_PENDING_MEMBERS = 4;

const store = createStore({ dbName: 'scryfall-archive', storeName: 'chunks', keyPath: 'key' });

/** @type {Promise<Map<string, number>|null>|null} printing id -> member index */
let indexPromise = null;
/** @type {{version: number, updatedAt: string|null, count: number, memberCount: number, bytes: number, compressed: boolean, fetchedAt: number}|null|undefined} */
let metaCache;
/** @type {Map<number, Map<string, object>>} member index -> id -> card */
const memberCache = new Map();

// ---------------------------------------------------------------- slim shape

/** Keep only the image sizes the tiles/tooltip can pick from. */
function slimImages(uris) {
  if (!uris) return undefined;
  return { thumb: uris.thumb, grid: uris.grid, normal: uris.normal };
}

function slimFace(face) {
  if (!face) return undefined;
  return {
    name: face.name,
    mana_cost: face.mana_cost,
    type_line: face.type_line,
    oracle_text: face.oracle_text,
    power: face.power,
    toughness: face.toughness,
    loyalty: face.loyalty,
    image_uris: slimImages(face.image_uris),
  };
}

/**
 * The subset of a Scryfall card the app renders, searches and prices. Dropping
 * the rest roughly halves the archive without changing any visible behaviour.
 *
 * @param {object} card
 * @returns {object|null}
 */
export function slimCard(card) {
  if (!card || typeof card.id !== 'string' || !card.id || typeof card.name !== 'string')
    return null;
  return {
    id: card.id,
    name: card.name,
    set: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    released_at: card.released_at,
    rarity: card.rarity,
    colors: card.colors,
    color_identity: card.color_identity,
    type_line: card.type_line,
    cmc: card.cmc,
    layout: card.layout,
    games: card.games,
    prices: card.prices,
    oracle_text: card.oracle_text,
    mana_cost: card.mana_cost,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    full_art: card.full_art,
    border_color: card.border_color,
    frame_effects: card.frame_effects,
    image_uris: slimImages(card.image_uris),
    card_faces: Array.isArray(card.card_faces) ? card.card_faces.map(slimFace) : undefined,
    related_uris: card.related_uris?.edhrec ? { edhrec: card.related_uris.edhrec } : undefined,
  };
}

// --------------------------------------------------------------- compression

const hasCompression = () =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/**
 * Gzip a UTF-8 string. Returns the raw bytes plus whether they are compressed,
 * so browsers without CompressionStream still work (just larger).
 * @returns {Promise<{bytes: Uint8Array, compressed: boolean}>}
 */
async function compress(text) {
  const raw = new TextEncoder().encode(text);
  if (!hasCompression()) return { bytes: raw, compressed: false };

  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  const writing = writer.write(raw).then(() => writer.close());
  const buffer = await new Response(stream.readable).arrayBuffer();
  await writing;
  return { bytes: new Uint8Array(buffer), compressed: true };
}

async function decompress(bytes, compressed = true) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!compressed) return new TextDecoder().decode(input);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress the card archive.');
  }

  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  const writing = writer.write(input).then(() => writer.close());
  const text = await new Response(stream.readable).text();
  await writing;
  return text;
}

// -------------------------------------------------------------------- builder

/**
 * Collect slim cards as the bulk file streams and write them out in compressed
 * members. `add` is synchronous (the stream loop is hot); compression runs on a
 * serialized background queue, and `settle()` lets the caller bound how far
 * ahead it runs.
 *
 * @param {{memberSize?: number}} [options]
 */
export function createCardArchiveBuilder({ memberSize = MEMBER_SIZE } = {}) {
  /** @type {Map<string, number>} */
  const index = new Map();
  /** @type {object[]} */
  let member = [];
  let memberIndex = 0;
  let memberCount = 0;
  let count = 0;
  let bytes = 0;
  let compressed = true;
  let pending = 0;
  let queue = Promise.resolve();

  function flush() {
    if (member.length === 0) return;

    const batch = member;
    member = [];
    const current = memberIndex++;
    memberCount++;
    const text = batch.map((record) => JSON.stringify(record)).join('\n');

    pending++;
    queue = queue
      .then(async () => {
        const result = await compress(text);
        compressed = compressed && result.compressed;
        bytes += result.bytes.length;
        await store.put({
          key: `member-${current}`,
          bytes: result.bytes,
          compressed: result.compressed,
        });
      })
      .catch((err) => console.error('Failed to write a card archive member:', err))
      .finally(() => {
        pending--;
      });
  }

  return {
    /** @param {object} card */
    add(card) {
      const record = slimCard(card);
      if (!record) return;
      index.set(record.id, memberIndex);
      member.push(record);
      count++;
      if (member.length >= memberSize) flush();
    },

    /** Await the write queue only when it has backed up (bounds memory). */
    async settle() {
      if (pending <= MAX_PENDING_MEMBERS) return;
      await queue;
    },

    /**
     * Flush everything and publish the index/meta. Meta is written last, so a
     * build interrupted midway leaves no valid archive (lookups fall back).
     *
     * @param {string|null} updatedAt The bulk file's `updated_at`.
     */
    async finish(updatedAt = null) {
      flush();
      await queue;

      const indexResult = await compress(JSON.stringify(Object.fromEntries(index)));
      await store.put({
        key: 'index',
        bytes: indexResult.bytes,
        compressed: indexResult.compressed,
      });
      await store.put({
        key: 'meta',
        value: {
          version: ARCHIVE_VERSION,
          updatedAt,
          fetchedAt: Date.now(),
          count,
          memberCount,
          bytes: bytes + indexResult.bytes.length,
          compressed: compressed && indexResult.compressed,
        },
      });

      resetCardArchiveCache();
      return count;
    },
  };
}

// --------------------------------------------------------------------- reader

/** Drop the in-memory index/meta/member copies (tests, rebuild). */
export function resetCardArchiveCache() {
  indexPromise = null;
  metaCache = undefined;
  memberCache.clear();
}

/**
 * Remove the published archive (meta) before a rebuild, so a build that fails
 * halfway can never be read as if it were complete.
 */
export async function beginCardArchiveBuild() {
  resetCardArchiveCache();
  await store.remove('meta');
}

/** The archive's metadata, or null when none has been built/version matches. */
export async function readCardArchiveMeta() {
  if (metaCache !== undefined) return metaCache;
  const record = await store.get('meta');
  const meta = record?.value ?? null;
  metaCache = meta && meta.version === ARCHIVE_VERSION ? meta : null;
  return metaCache;
}

/** True when a complete, current-version archive is available. */
export async function hasCardArchive() {
  return Boolean(await readCardArchiveMeta());
}

async function loadIndex() {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const record = await store.get('index');
    if (!record?.bytes) return null;
    const text = await decompress(record.bytes, record.compressed !== false);
    return new Map(Object.entries(JSON.parse(text)));
  })().catch((err) => {
    console.error('Failed to read the card archive index:', err);
    return null;
  });
  return indexPromise;
}

async function loadMember(member) {
  const cached = memberCache.get(member);
  if (cached) {
    // Refresh LRU order.
    memberCache.delete(member);
    memberCache.set(member, cached);
    return cached;
  }

  const meta = await readCardArchiveMeta();
  const record = await store.get(`member-${member}`);
  if (!record?.bytes) return new Map();

  const text = await decompress(record.bytes, meta?.compressed !== false);
  const cards = new Map();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const card = JSON.parse(line);
    if (card?.id) cards.set(card.id, card);
  }

  memberCache.set(member, cards);
  if (memberCache.size > MEMBER_CACHE_LIMIT) {
    memberCache.delete(memberCache.keys().next().value);
  }
  return cards;
}

/**
 * Read cards for the given printing ids from the archive. Unknown ids (or a
 * missing archive) are simply absent from the result, so the caller can fall
 * back to the network.
 *
 * @param {Iterable<string>} ids
 * @returns {Promise<Map<string, object>>}
 */
export async function readArchivedCards(ids) {
  const wanted = [...new Set(ids || [])].filter((id) => typeof id === 'string' && id);
  const result = new Map();
  if (wanted.length === 0 || !(await hasCardArchive())) return result;

  const index = await loadIndex();
  if (!index) return result;

  /** @type {Map<number, string[]>} */
  const byMember = new Map();
  for (const id of wanted) {
    const member = index.get(id);
    if (member === undefined) continue;
    if (!byMember.has(member)) byMember.set(member, []);
    byMember.get(member).push(id);
  }

  for (const [member, memberIds] of byMember) {
    const cards = await loadMember(member);
    for (const id of memberIds) {
      const card = cards.get(id);
      if (card) result.set(id, card);
    }
  }
  return result;
}

/** Drop the archive (setting turned off, or a manual reset). */
export async function clearCardArchive() {
  resetCardArchiveCache();
  await store.clear();
}
