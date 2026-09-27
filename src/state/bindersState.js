/**
 * The Binder Builder's binder registry.
 *
 * A binder is a named grid of physical pockets: `columns × rows` slots per
 * page, `pages` pages. Every slot is addressed by a `"page:row:col"` key and
 * holds one Scryfall printing id (or nothing).
 *
 * Like the collections and custom lists, the registry mirrors a server/local
 * split:
 *  - signed-in callers read/write the server (`binders`/`manage-binder`/
 *    `merge-binders` functions),
 *  - signed-out visitors (and share-link visitors, since binders are private)
 *    keep device-local binders in IndexedDB and merge them on sign-in.
 *
 * Every mutation dispatches `binders:changed` so the editor repaints without
 * importing this module's internals.
 */
import { mainState } from './mainState.js';
import { getSetting } from './cardSettings.js';
import { cardStore, primaryName } from './cardStore.js';
import { resolveCatalogName } from './cardCatalog.js';
import { evaluateCondition, parseQuery } from './cardQuery.js';
import {
  createBinder as apiCreateBinder,
  deleteBinder as apiDeleteBinder,
  fetchBinders,
  mergeBinders as apiMergeBinders,
  updateBinder as apiUpdateBinder,
} from '../api/binders.js';
import {
  clearLocalBinders,
  loadLocalBinders,
  removeLocalBinder,
  saveLocalBinder,
} from './localBinders.js';
import {
  createAnnouncer,
  createIdFactory,
  createWriteQueue,
  isLocalView,
  isShareView,
} from './registrySupport.js';

const ACTIVE_KEY = 'activeBinderId';

/** Hard caps so a malformed stored/synced record can't create a huge grid. */
export const MAX_BINDER_COLUMNS = 16;
export const MAX_BINDER_ROWS = 16;
export const MAX_BINDER_PAGES = 200;
/** Most copies one pocket may hold. */
export const MAX_CARD_QUANTITY = 999;
const MIN_BINDER_COLUMNS = 1;
const MIN_BINDER_ROWS = 1;

/** id -> binder record */
const binders = new Map();
let activeId = null;

/** Serializes server writes so responses can't land out of order. */
const enqueue = createWriteQueue();
const announce = createAnnouncer('binders:changed');
const newId = createIdFactory('binder');

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const isShareMode = isShareView;
const isLocalMode = isLocalView;

/** Binders can be edited except in a share view. */
export function canEditBinders() {
  return !isShareMode();
}

/** `"page:row:col"` for one pocket. */
export function slotKey(page, row, col) {
  return `${page}:${row}:${col}`;
}

/** Parse a slot key back into numbers, or `null` when malformed. */
export function parseSlotKey(key) {
  const [page, row, col] = String(key)
    .split(':')
    .map((part) => Number.parseInt(part, 10));
  if (![page, row, col].every((n) => Number.isInteger(n) && n >= 0)) return null;
  return { page, row, col };
}

/** Keep only slot entries that look like `"p:r:c" -> id`. */
function sanitizeSlots(source) {
  const clean = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return clean;
  for (const [key, value] of Object.entries(source)) {
    if (parseSlotKey(key) && typeof value === 'string' && value) clean[key] = value;
  }
  return clean;
}

/**
 * Keep only per-pocket counts above one that point at an occupied slot, so the
 * map stays sparse and never carries an orphaned quantity.
 */
function sanitizeQuantities(source, slots) {
  const clean = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return clean;
  for (const [key, value] of Object.entries(source)) {
    if (!slots[key]) continue;
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 1) {
      clean[key] = Math.min(parsed, MAX_CARD_QUANTITY);
    }
  }
  return clean;
}

/** Keep only foil marks that point at an occupied slot. */
function sanitizeFoils(source, slots) {
  const clean = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return clean;
  for (const [key, value] of Object.entries(source)) {
    if (slots[key] && (value === true || value === 1 || value === 'true')) clean[key] = true;
  }
  return clean;
}

/** Copies held by one pocket (1 unless a count is stored, 0 when empty). */
export function getSlotQuantity(binderId, key) {
  const binder = binders.get(binderId);
  if (!binder || !binder.slots[key]) return 0;
  return binder.quantities[key] || 1;
}

/** True when the pocket's copy is marked foil. */
export function isSlotFoil(binderId, key) {
  const binder = binders.get(binderId);
  return Boolean(binder && binder.slots[key] && binder.foils[key]);
}

/** Set/clear one pocket's count in memory (only counts above one are stored). */
function setQuantityInternal(binder, key, quantity) {
  const parsed = Number.parseInt(quantity, 10);
  const clamped = Math.min(MAX_CARD_QUANTITY, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
  if (clamped > 1) binder.quantities[key] = clamped;
  else delete binder.quantities[key];
}

/**
 * Keep only non-empty front-face card names as an owned set. Accepts an array
 * (wire/local record) or an already-built Set (in-memory snapshot).
 */
function sanitizeOwned(source) {
  const clean = new Set();
  const values = source instanceof Set ? source : Array.isArray(source) ? source : [];
  for (const name of values) {
    if (typeof name === 'string' && name.trim()) clean.add(name.trim());
  }
  return clean;
}

function normalizeBinder(record) {
  const now = new Date().toISOString();
  const slots = sanitizeSlots(record.slots);
  return {
    id: String(record.id),
    name: String(record.name || 'Binder').slice(0, 80),
    columns: clampInt(record.columns, MIN_BINDER_COLUMNS, MAX_BINDER_COLUMNS, 3),
    rows: clampInt(record.rows, MIN_BINDER_ROWS, MAX_BINDER_ROWS, 3),
    pages: clampInt(record.pages, 1, MAX_BINDER_PAGES, 1),
    isPublic: Boolean(record.isPublic),
    slots,
    quantities: sanitizeQuantities(record.quantities, slots),
    foils: sanitizeFoils(record.foils, slots),
    // Binder-scoped owned markers, separate from the account collection.
    owned: sanitizeOwned(record.owned),
    createdAt: record.createdAt || now,
    updatedAt: record.updatedAt || now,
  };
}

/** The server/local record shape sent over the wire or to IndexedDB. */
function toRecord(binder) {
  return {
    id: binder.id,
    name: binder.name,
    columns: binder.columns,
    rows: binder.rows,
    pages: binder.pages,
    isPublic: binder.isPublic,
    slots: { ...binder.slots },
    quantities: { ...binder.quantities },
    foils: { ...binder.foils },
    owned: [...binder.owned],
    createdAt: binder.createdAt,
    updatedAt: binder.updatedAt,
  };
}

function rememberActive(id) {
  activeId = id;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* best effort */
  }
}

/** Replace the whole registry with a fresh server snapshot. */
function applyBinders(records) {
  binders.clear();
  for (const record of records || []) {
    if (!record || typeof record.id !== 'string') continue;
    binders.set(record.id, normalizeBinder(record));
  }
  announce();
}

async function persistLocal(binder) {
  try {
    await saveLocalBinder(toRecord(binder));
  } catch (err) {
    console.error('Failed to persist the binder:', err);
  }
}

/**
 * Push a binder snapshot to the server, taking the snapshot now (so serialized
 * writes always carry the latest state) and adopting the server's reply.
 */
function pushBinder(binderId) {
  const binder = binders.get(binderId);
  if (!binder) return Promise.resolve(null);
  const record = toRecord(binder);

  return enqueue(async () => {
    try {
      applyBinders(await apiUpdateBinder(binderId, record));
    } catch (err) {
      console.error('Failed to save the binder:', err);
    }
  });
}

/** Every binder, oldest first then by name. */
export function getBinders() {
  return [...binders.values()].sort((a, b) => {
    const at = a.createdAt || '';
    const bt = b.createdAt || '';
    return at.localeCompare(bt) || a.name.localeCompare(b.name);
  });
}

export function getBinder(id) {
  return binders.get(id) || null;
}

export function getBinderByName(name) {
  const target = String(name || '').toLowerCase();
  return getBinders().find((binder) => binder.name.toLowerCase() === target) || null;
}

/** A binder's slot keys ordered page → row → column. */
function sortedSlotKeys(binder) {
  return Object.keys(binder.slots).sort((a, b) => {
    const pa = parseSlotKey(a);
    const pb = parseSlotKey(b);
    if (!pa || !pb) return 0;
    return pa.page - pb.page || pa.row - pb.row || pa.col - pb.col;
  });
}

/** Every printing id stored in a binder, in slot order. */
export function getBinderPrintingIds(binderId) {
  const binder = binders.get(binderId);
  if (!binder) return [];
  return sortedSlotKeys(binder).map((key) => binder.slots[key]);
}

/**
 * Every pocket's card, repeated once per copy, in slot order. Statistics uses
 * this so a pocket holding four Sol Rings counts as four cards.
 *
 * @param {string} binderId
 * @returns {Array<{id: string, name: string}>}
 */
export function getBinderSlotCards(binderId) {
  const binder = binders.get(binderId);
  if (!binder) return [];

  const cards = [];
  for (const key of sortedSlotKeys(binder)) {
    const printingId = binder.slots[key];
    const card = cardStore.getByPrintingId(printingId) || { id: printingId, name: printingId };
    const copies = binder.quantities[key] || 1;
    for (let i = 0; i < copies; i++) cards.push(card);
  }
  return cards;
}

/**
 * The member cards of a binder, one per card name, in slot order. Each entry
 * carries a `count` (the summed per-pocket quantities for that name) so an
 * export of a pre-built binder keeps its duplicates, e.g. seven Islands read as
 * `7 Island`. Unloaded printings fall back to a bare `{ id, name }` so an export
 * never loses a row.
 *
 * @param {string} binderId
 * @returns {Array<{id: string, name: string, count: number}>}
 */
export function getBinderCards(binderId) {
  const binder = binders.get(binderId);
  if (!binder) return [];

  const byName = new Map();
  for (const key of sortedSlotKeys(binder)) {
    const printingId = binder.slots[key];
    const card = cardStore.getByPrintingId(printingId);
    const name = card ? primaryName(card) : printingId;
    const copies = binder.quantities[key] || 1;
    const existing = byName.get(name);
    if (existing) {
      existing.count += copies;
      continue;
    }
    // Copy the store object so the per-binder count never leaks into `cardStore`.
    byName.set(name, { ...(card || { id: printingId, name: printingId }), count: copies });
  }
  return [...byName.values()];
}

/**
 * The total number of cards in a binder, duplicates and per-pocket counts
 * included — the binder's quantity. Needs no hydrated card objects.
 *
 * @param {string} binderId
 * @returns {number}
 */
export function getBinderQuantity(binderId) {
  const binder = binders.get(binderId);
  if (!binder) return 0;
  return Object.keys(binder.slots).reduce((sum, key) => sum + (binder.quantities[key] || 1), 0);
}

/**
 * Find pockets in a binder whose card matches a query. Plain words match the
 * card name, set code or collector number; anything using the browse syntax
 * (`t:creature`, `c:wu`, `r:mythic`, `is:owned`, `!…`, `and`/`or`, …) is
 * evaluated with the shared smart filter. Unloaded printings are named from the
 * all-cards catalog. Returns one entry per matching pocket in slot order, with
 * its page/row/column so the editor can jump to it.
 *
 * @param {string} binderId
 * @param {string} query
 * @returns {Array<{key: string, printingId: string, name: string, page: number, row: number, col: number}>}
 */
export function findBinderMatches(binderId, query) {
  const binder = binders.get(binderId);
  const trimmed = String(query || '').trim();
  if (!binder || trimmed.length === 0) return [];

  // Syntax-bearing queries go through the smart filter; a plain term keeps the
  // quick name/set/number substring match.
  const smart = /[:!()]|\s(?:and|or)\s/i.test(trimmed);
  const conditions = smart ? parseQuery(trimmed) : [];
  const needle = trimmed.toLowerCase();

  const matches = [];
  for (const key of sortedSlotKeys(binder)) {
    const printingId = binder.slots[key];
    const stored = cardStore.getByPrintingId(printingId);
    const name = (stored ? primaryName(stored) : resolveCatalogName(printingId)) || printingId;

    let hit;
    if (smart) {
      // An unloaded printing has only its id: evaluate against a stub (named from
      // the catalog) so a plain term inside a compound query still works, then
      // fall back to the id. `is:owned`/`is:missing` read the binder's own marks.
      const card = stored || { id: printingId, name, set: '', set_name: '' };
      const overrides = { isOwned: (entry) => isBinderCardOwned(binderId, entry) };
      hit =
        conditions.every((condition) => evaluateCondition(card, condition, overrides)) ||
        printingId.toLowerCase().includes(needle);
    } else {
      const set = (stored?.set || '').toLowerCase();
      const number = String(stored?.collector_number || '').toLowerCase();
      hit =
        name.toLowerCase().includes(needle) ||
        set.includes(needle) ||
        number.includes(needle) ||
        printingId.toLowerCase().includes(needle);
    }

    if (hit) {
      const parsed = parseSlotKey(key);
      if (parsed) matches.push({ key, printingId, name, ...parsed });
    }
  }
  return matches;
}

/**
 * True when the card was marked owned *inside this binder*. This is a separate
 * data stream from the account collection.
 */
export function isBinderCardOwned(binderId, cardOrName) {
  const binder = binders.get(binderId);
  if (!binder) return false;
  const name = primaryName(cardOrName);
  return Boolean(name) && binder.owned.has(name);
}

/**
 * Flip a card's owned marker inside one binder and persist it. Accepts a card
 * object or a front-face name.
 *
 * @returns {Promise<boolean|null>} the new owned state, or null when invalid.
 */
export async function toggleBinderOwned(binderId, cardOrName) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder) return null;
  const name = primaryName(cardOrName);
  if (!name) return null;

  const next = !binder.owned.has(name);
  if (next) binder.owned.add(name);
  else binder.owned.delete(name);

  await commit(binder);
  return next;
}

/**
 * Quantity tally for the builder chrome: filled pockets split into owned and
 * missing by the binder's own markers. Unloaded cards count as missing until
 * they hydrate.
 *
 * @returns {{total: number, owned: number, missing: number}}
 */
export function getBinderOwnedSummary(binderId) {
  const binder = binders.get(binderId);
  if (!binder) return { total: 0, owned: 0, missing: 0 };

  let total = 0;
  let owned = 0;
  for (const [key, printingId] of Object.entries(binder.slots)) {
    const copies = binder.quantities[key] || 1;
    total += copies;
    const card = cardStore.getByPrintingId(printingId);
    const name = card ? primaryName(card) : null;
    if (name && binder.owned.has(name)) owned += copies;
  }
  return { total, owned, missing: total - owned };
}

/**
 * True when the shown printing — or any other printing of the same name — sits
 * in the binder (name-aware, like an owned/list check).
 */
export function isCardInBinder(binderId, card) {
  if (!card) return false;
  const binder = binders.get(binderId);
  if (!binder) return false;

  const slotIds = new Set(Object.values(binder.slots));
  if (slotIds.has(card.id)) return true;
  return cardStore.getPrintings(card.name).some((printing) => slotIds.has(printing.id));
}

export function getActiveBinderId() {
  // Fall back to the first binder when the stored selection is gone.
  if (activeId && binders.has(activeId)) return activeId;
  return getBinders()[0]?.id || null;
}

export function getActiveBinder() {
  return getBinder(getActiveBinderId());
}

export function setActiveBinder(id) {
  if (!binders.has(id)) return;
  rememberActive(id);
  announce();
}

/** A name that does not collide with an existing binder. */
function uniqueName(base = 'Binder') {
  const taken = new Set([...binders.values()].map((binder) => binder.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

/**
 * In-flight source load, shared by concurrent `loadBinders` callers. The shell
 * starts loading binders for the bulk modals while the Binder Builder page
 * mounts its own editor; they should share one round trip instead of each
 * fetching the same records.
 * @type {Promise<void>|null}
 */
let pendingLoad = null;

/** Fetch the applicable binder records and replace the in-memory registry. */
async function fetchBinderRecords() {
  if (isShareMode()) {
    try {
      applyBinders(await fetchBinders({ shareToken: mainState.shareToken }));
    } catch (err) {
      console.error('Failed to load shared binders:', err);
      binders.clear();
    }
    return;
  }

  if (isLocalMode()) {
    let records;
    try {
      records = await loadLocalBinders();
    } catch (err) {
      console.error('Failed to load local binders:', err);
      records = [];
    }

    binders.clear();
    for (const record of records) {
      if (!record || typeof record.id !== 'string') continue;
      binders.set(record.id, normalizeBinder(record));
    }
    return;
  }

  try {
    applyBinders(await fetchBinders());
  } catch (err) {
    console.error('Failed to load binders:', err);
    binders.clear();
  }
}

/**
 * Load binders from whichever source applies. Concurrent callers share a single
 * fetch. `seed` creates a default binder when the caller has none (the Binder
 * Builder page wants one; the browse page's bulk modals only need to list
 * existing binders).
 * @param {{seed?: boolean}} [options]
 */
export async function loadBinders({ seed = true } = {}) {
  if (!pendingLoad) {
    pendingLoad = fetchBinderRecords().finally(() => {
      pendingLoad = null;
    });
  }
  await pendingLoad;

  try {
    activeId = localStorage.getItem(ACTIVE_KEY);
  } catch {
    activeId = null;
  }

  if (binders.size === 0 && seed && canEditBinders()) {
    await ensureSeedBinder();
  }

  announce();
  return getBinders();
}

/**
 * Create the default "Binder 1" when the registry is empty. Split out from
 * {@link loadBinders} so the Binder Builder can wait until any guest→account
 * merge has settled before deciding the account really has no binders.
 *
 * @returns {Promise<object[]>} the binder list
 */
export async function ensureSeedBinder() {
  if (binders.size > 0 || !canEditBinders()) return getBinders();

  await createBinder({
    name: 'Binder 1',
    columns: clampInt(getSetting('gridColumns'), 1, MAX_BINDER_COLUMNS, 3),
    rows: clampInt(getSetting('gridRows'), 1, MAX_BINDER_ROWS, 3),
    pages: clampInt(getSetting('pagesPerBinder'), 1, MAX_BINDER_PAGES, 1),
    silent: true,
  });
  announce();
  return getBinders();
}

/**
 * Create a binder and make it active.
 * @param {{name?: string, columns?: number, rows?: number, pages?: number, isPublic?: boolean, silent?: boolean, activate?: boolean}} input
 */
export async function createBinder({
  name,
  columns = 3,
  rows = 3,
  pages = 1,
  isPublic = false,
  silent = false,
  activate = true,
} = {}) {
  if (!canEditBinders()) return null;

  const nextName = uniqueName(String(name || `Binder ${binders.size + 1}`).trim() || 'Binder');
  const dims = {
    columns: clampInt(columns, MIN_BINDER_COLUMNS, MAX_BINDER_COLUMNS, 3),
    rows: clampInt(rows, MIN_BINDER_ROWS, MAX_BINDER_ROWS, 3),
    pages: clampInt(pages, 1, MAX_BINDER_PAGES, 1),
  };
  const publicFlag = Boolean(isPublic);

  if (!isLocalMode()) {
    let created = null;
    try {
      applyBinders(
        await apiCreateBinder({
          name: nextName,
          ...dims,
          isPublic: publicFlag,
          slots: {},
          quantities: {},
          foils: {},
          owned: [],
        })
      );
      created = getBinderByName(nextName);
    } catch (err) {
      console.error('Failed to create the binder:', err);
    }
    if (created && activate) rememberActive(created.id);
    return created;
  }

  const now = new Date().toISOString();
  const binder = normalizeBinder({
    id: newId(),
    name: nextName,
    ...dims,
    isPublic: publicFlag,
    slots: {},
    createdAt: now,
    updatedAt: now,
  });

  binders.set(binder.id, binder);
  if (activate) rememberActive(binder.id);
  await persistLocal(binder);
  if (!silent) announce();
  return binder;
}

/** The next free `"<base> (n)"` name, starting at n=2. */
function partName(base, start = 2) {
  const taken = new Set(getBinders().map((binder) => binder.name.toLowerCase()));
  let n = start;
  while (taken.has(`${base} (${n})`.toLowerCase())) n += 1;
  return `${base} (${n})`;
}

/**
 * Resize a binder without ever dropping a card. Pockets that still exist in the
 * new grid keep their card; cards displaced by a smaller grid shift into the
 * first free pockets. Anything that still doesn't fit spills into one or more
 * newly created continuation binder(s).
 *
 * @param {string} id
 * @param {{columns?: number, rows?: number, pages?: number}} dims
 * @returns {Promise<{binder: object, overflow: {id: string, name: string, count: number}[]} | null>}
 */
export async function resizeBinder(id, dims = {}) {
  if (!canEditBinders()) return null;
  const binder = binders.get(id);
  if (!binder) return null;

  const columns = clampInt(
    dims.columns ?? binder.columns,
    MIN_BINDER_COLUMNS,
    MAX_BINDER_COLUMNS,
    binder.columns
  );
  const rows = clampInt(dims.rows ?? binder.rows, MIN_BINDER_ROWS, MAX_BINDER_ROWS, binder.rows);
  const pages = clampInt(dims.pages ?? binder.pages, 1, MAX_BINDER_PAGES, binder.pages);

  if (columns === binder.columns && rows === binder.rows && pages === binder.pages) {
    return { binder, overflow: [] };
  }

  // Keep every pocket that still exists in the new grid, in reading order;
  // queue the rest so they can be shifted into the freed pockets. Each card
  // carries its per-pocket count so the copies are never lost.
  const keptSlots = {};
  const keptQuantities = {};
  const keptFoils = {};
  const displaced = [];
  for (const key of sortedSlotKeys(binder)) {
    const parsed = parseSlotKey(key);
    if (!parsed) continue;
    if (parsed.page < pages && parsed.row < rows && parsed.col < columns) {
      keptSlots[key] = binder.slots[key];
      if (binder.quantities[key] > 1) keptQuantities[key] = binder.quantities[key];
      if (binder.foils[key]) keptFoils[key] = true;
    } else {
      displaced.push({
        id: binder.slots[key],
        qty: binder.quantities[key] || 1,
        foil: Boolean(binder.foils[key]),
      });
    }
  }

  // Shift displaced cards into the first free pockets, page → row → column.
  const slots = { ...keptSlots };
  const quantities = { ...keptQuantities };
  const foils = { ...keptFoils };
  let placed = 0;
  for (let page = 0; page < pages && placed < displaced.length; page++) {
    for (let row = 0; row < rows && placed < displaced.length; row++) {
      for (let col = 0; col < columns && placed < displaced.length; col++) {
        const key = slotKey(page, row, col);
        if (slots[key]) continue;
        const card = displaced[placed++];
        slots[key] = card.id;
        if (card.qty > 1) quantities[key] = card.qty;
        if (card.foil) foils[key] = true;
      }
    }
  }

  const overflow = displaced.slice(placed);
  const sourceName = binder.name;
  const sourceIsPublic = binder.isPublic;

  binder.columns = columns;
  binder.rows = rows;
  binder.pages = pages;
  binder.slots = slots;
  binder.quantities = quantities;
  binder.foils = foils;
  // Persist the source before creating anything else: the create path can
  // rebuild the in-memory registry from the server's reply.
  await commit(binder, { silent: true });

  const overflowBinders = [];
  let remaining = overflow;
  let part = 2;
  while (remaining.length > 0) {
    const perPage = columns * rows;
    const pagesNeeded = Math.min(
      MAX_BINDER_PAGES,
      Math.max(1, Math.ceil(remaining.length / perPage))
    );
    const chunk = remaining.slice(0, perPage * pagesNeeded);

    const created = await createBinder({
      name: partName(sourceName, part++),
      columns,
      rows,
      pages: pagesNeeded,
      isPublic: sourceIsPublic,
      silent: true,
      activate: false,
    });
    if (!created) {
      // The continuation could not be created (e.g. a server error). Grow the
      // source binder instead so the cards are never silently dropped.
      const fallback = binders.get(id);
      for (const card of remaining) {
        let key = firstEmptySlotKey(fallback);
        if (!key) {
          if (fallback.pages >= MAX_BINDER_PAGES) {
            console.error('Could not place an overflow card; binder is full:', card.id);
            continue;
          }
          fallback.pages += 1;
          key = slotKey(fallback.pages - 1, 0, 0);
        }
        fallback.slots[key] = card.id;
        if (card.qty > 1) fallback.quantities[key] = card.qty;
        if (card.foil) fallback.foils[key] = true;
      }
      await commit(fallback, { silent: true });
      break;
    }

    remaining = remaining.slice(chunk.length);
    const target = binders.get(created.id) || created;
    let moved = 0;
    chunk.forEach((card, index) => {
      const page = Math.floor(index / perPage);
      const within = index % perPage;
      const key = slotKey(page, Math.floor(within / columns), within % columns);
      target.slots[key] = card.id;
      if (card.qty > 1) target.quantities[key] = card.qty;
      if (card.foil) target.foils[key] = true;
      moved += card.qty;
    });
    await commit(target, { silent: true });
    overflowBinders.push({ id: target.id, name: target.name, count: moved });
  }

  announce();
  return { binder, overflow: overflowBinders };
}

/**
 * Patch a binder's name, dimensions and/or share visibility. Dimension changes
 * go through `resizeBinder` so cards are shifted/kept rather than orphaned.
 */
export async function updateBinder(id, patch = {}) {
  if (!canEditBinders()) return null;
  if (!binders.has(id)) return null;

  if (patch.columns != null || patch.rows != null || patch.pages != null) {
    const resized = await resizeBinder(id, {
      columns: patch.columns,
      rows: patch.rows,
      pages: patch.pages,
    });
    if (!resized) return null;
  }

  // Re-read after a resize: the server path rebuilds the registry from its reply.
  const binder = binders.get(id);
  if (!binder) return null;

  let changed = false;
  if (patch.name != null) {
    const next = String(patch.name).trim().slice(0, 80);
    const clash =
      next &&
      getBinders().some((item) => item.id !== id && item.name.toLowerCase() === next.toLowerCase());
    if (next && !clash && binder.name !== next) {
      binder.name = next;
      changed = true;
    }
  }
  if (patch.isPublic != null && binder.isPublic !== Boolean(patch.isPublic)) {
    binder.isPublic = Boolean(patch.isPublic);
    changed = true;
  }

  // A resize already persisted and announced; only commit name/public edits.
  if (!changed) return binder;
  return commit(binder);
}

/**
 * After deleting `deletedId`, move the selection to the binder that took its
 * place (or the previous one when the last tab was removed) and persist it, so
 * the editor lands next to where the user was and `localStorage` never keeps a
 * deleted binder.
 *
 * @param {string} deletedId
 * @param {number} index position of the deleted binder in the pre-delete order
 */
function selectNeighbourAfterDelete(deletedId, index) {
  if (activeId !== deletedId) return;
  const remaining = getBinders();
  if (remaining.length === 0) {
    activeId = null;
    return;
  }
  const neighbour = remaining[Math.min(Math.max(index, 0), remaining.length - 1)];
  activeId = neighbour.id;
  rememberActive(activeId);
}

/** Delete a binder; a new empty one is seeded when the last is removed. */
export async function deleteBinder(id) {
  if (!canEditBinders() || !binders.has(id)) return false;

  // Remember where the deleted binder sat so the selection can move to the
  // binder that replaces it rather than jumping back to the oldest.
  const index = getBinders().findIndex((binder) => binder.id === id);

  if (!isLocalMode()) {
    try {
      applyBinders(await apiDeleteBinder(id));
    } catch (err) {
      console.error('Failed to delete the binder:', err);
      return false;
    }
    selectNeighbourAfterDelete(id, index);
    if (binders.size === 0) {
      await createBinder({ name: 'Binder 1', columns: 3, rows: 3, pages: 1, silent: true });
    }
    announce();
    return true;
  }

  binders.delete(id);
  try {
    await removeLocalBinder(id);
  } catch (err) {
    console.error('Failed to remove the local binder:', err);
  }

  selectNeighbourAfterDelete(id, index);

  if (binders.size === 0) {
    await createBinder({ name: 'Binder 1', columns: 3, rows: 3, pages: 1, silent: true });
  }
  announce();
  return true;
}

/** Persist a mutated binder (local write, or a serialized server push). */
async function commit(binder, { silent = false } = {}) {
  binder.updatedAt = new Date().toISOString();
  if (isLocalMode()) {
    await persistLocal(binder);
    if (!silent) announce();
    return binder;
  }
  await pushBinder(binder.id);
  return binder;
}

/** Place a printing in a slot (replacing whatever was there; count resets to 1). */
export async function assignCardToSlot(binderId, key, printingId) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder || !parseSlotKey(key) || typeof printingId !== 'string' || !printingId) return null;
  binder.slots[key] = printingId;
  // A freshly placed card holds one copy and is non-foil; any old count/foil
  // belonged to the card that just left the pocket.
  setQuantityInternal(binder, key, 1);
  delete binder.foils[key];
  return commit(binder);
}

/** Empty one slot. */
export async function clearSlot(binderId, key) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder || !(key in binder.slots)) return null;
  delete binder.slots[key];
  delete binder.quantities[key];
  delete binder.foils[key];
  return commit(binder);
}

/**
 * Set how many copies one pocket holds (clamped to 1..{@link MAX_CARD_QUANTITY}).
 * A count of one clears the stored entry.
 */
export async function setSlotQuantity(binderId, key, quantity) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder || !parseSlotKey(key) || !binder.slots[key]) return null;
  setQuantityInternal(binder, key, quantity);
  return commit(binder);
}

/**
 * Flip a pocket's foil mark. Accepts every copy in the pocket as one finish.
 *
 * @returns {Promise<boolean|null>} the new foil state, or null when invalid.
 */
export async function toggleSlotFoil(binderId, key) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder || !parseSlotKey(key) || !binder.slots[key]) return null;

  const next = !binder.foils[key];
  if (next) binder.foils[key] = true;
  else delete binder.foils[key];
  await commit(binder);
  return next;
}

/**
 * Apply an owned and/or foil change to several pockets at once, committing a
 * single time. Owned markers are name-based (so the whole card is covered);
 * foil marks are per-pocket. Only the provided patch fields are touched.
 *
 * @param {string} binderId
 * @param {string[]} keys pocket slot keys
 * @param {{owned?: boolean, foil?: boolean}} patch
 * @returns {Promise<object|null>} the updated binder
 */
export async function applyBinderBulk(binderId, keys, patch = {}) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder) return null;

  const slots = (Array.isArray(keys) ? keys : []).filter((key) => binder.slots[key]);
  if (slots.length === 0) return binder;

  if (typeof patch.foil === 'boolean') {
    for (const key of slots) {
      if (patch.foil) binder.foils[key] = true;
      else delete binder.foils[key];
    }
  }

  if (typeof patch.owned === 'boolean') {
    const names = new Set();
    for (const key of slots) {
      const printingId = binder.slots[key];
      const card = cardStore.getByPrintingId(printingId);
      const name = card ? primaryName(card) : resolveCatalogName(printingId);
      if (name) names.add(name);
    }
    for (const name of names) {
      if (patch.owned) binder.owned.add(name);
      else binder.owned.delete(name);
    }
  }

  return commit(binder);
}

/** Move a card (and its count/foil) to another slot, swapping when occupied. */
export async function moveSlot(binderId, fromKey, toKey) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder || fromKey === toKey) return null;
  if (!parseSlotKey(fromKey) || !parseSlotKey(toKey)) return null;

  const moving = binder.slots[fromKey];
  if (!moving) return null;

  const movingQty = binder.quantities[fromKey] || 1;
  const movingFoil = Boolean(binder.foils[fromKey]);
  const target = binder.slots[toKey];
  const targetQty = binder.quantities[toKey] || 1;
  const targetFoil = Boolean(binder.foils[toKey]);

  binder.slots[toKey] = moving;
  if (movingQty > 1) binder.quantities[toKey] = movingQty;
  else delete binder.quantities[toKey];
  if (movingFoil) binder.foils[toKey] = true;
  else delete binder.foils[toKey];

  if (target) {
    binder.slots[fromKey] = target;
    if (targetQty > 1) binder.quantities[fromKey] = targetQty;
    else delete binder.quantities[fromKey];
    if (targetFoil) binder.foils[fromKey] = true;
    else delete binder.foils[fromKey];
  } else {
    delete binder.slots[fromKey];
    delete binder.quantities[fromKey];
    delete binder.foils[fromKey];
  }

  return commit(binder);
}

/** The first empty `page:row:col` key, or null when every pocket is taken. */
function firstEmptySlotKey(binder) {
  for (let page = 0; page < binder.pages; page++) {
    for (let row = 0; row < binder.rows; row++) {
      for (let col = 0; col < binder.columns; col++) {
        const key = slotKey(page, row, col);
        if (!binder.slots[key]) return key;
      }
    }
  }
  return null;
}

/**
 * Move a card from one binder to the first empty pocket of another, growing the
 * destination when it is full. Used by the builder's "switch binder while
 * moving" flow.
 *
 * @returns {Promise<object|null>} the destination binder
 */
export async function moveCardToFirstEmptySlot(fromBinderId, fromKey, toBinderId) {
  if (!canEditBinders()) return null;
  if (fromBinderId === toBinderId) return null;

  const from = binders.get(fromBinderId);
  const to = binders.get(toBinderId);
  if (!from || !to || !parseSlotKey(fromKey)) return null;

  const printingId = from.slots[fromKey];
  if (!printingId) return null;
  const copies = from.quantities[fromKey] || 1;
  const foil = Boolean(from.foils[fromKey]);

  let targetKey = firstEmptySlotKey(to);
  if (!targetKey) {
    if (to.pages >= MAX_BINDER_PAGES) return null;
    to.pages += 1;
    targetKey = slotKey(to.pages - 1, 0, 0);
  }

  delete from.slots[fromKey];
  delete from.quantities[fromKey];
  delete from.foils[fromKey];
  to.slots[targetKey] = printingId;
  if (copies > 1) to.quantities[targetKey] = copies;
  else delete to.quantities[targetKey];
  if (foil) to.foils[targetKey] = true;
  else delete to.foils[targetKey];

  const now = new Date().toISOString();
  from.updatedAt = now;
  to.updatedAt = now;

  if (isLocalMode()) {
    await persistLocal(from);
    await persistLocal(to);
    announce();
    return to;
  }

  // Server mode: push both sides; the queue keeps the writes ordered.
  await Promise.all([pushBinder(from.id), pushBinder(to.id)]);
  return to;
}

/** Empty every slot on one page. */
export async function clearPage(binderId, page) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder) return null;

  let changed = false;
  for (const key of Object.keys(binder.slots)) {
    const parsed = parseSlotKey(key);
    if (parsed && parsed.page === page) {
      delete binder.slots[key];
      delete binder.quantities[key];
      delete binder.foils[key];
      changed = true;
    }
  }
  if (!changed) return binder;

  return commit(binder);
}

/**
 * Add a batch of cards to a binder, one pocket per copy. A card's
 * `count`/`quantity` expands to that many pockets in the first empty slots (in
 * slot order, growing the page count when it runs out, up to `MAX_BINDER_PAGES`),
 * so a pasted "7 Island" becomes seven pockets and a list with several printings
 * fills a pocket for each. Each new pocket holds one copy; use the pocket
 * stepper to stack copies of your own.
 *
 * @param {string} binderId
 * @param {object[]} cards
 * @returns {Promise<object|null>} the updated binder
 */
export async function addCardsToBinder(binderId, cards) {
  if (!canEditBinders()) throw new Error('Binders are read-only in a shared view.');
  const binder = binders.get(binderId);
  if (!binder) throw new Error('Binder not found.');

  const queue = [];
  for (const card of Array.isArray(cards) ? cards : [cards]) {
    if (!card || !card.id) continue;
    const raw = Number(card.count ?? card.quantity ?? 1);
    const copies = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
    // One entry per copy so every copy claims its own physical pocket.
    for (
      let i = 0;
      i < copies && queue.length < MAX_BINDER_PAGES * binder.columns * binder.rows;
      i++
    ) {
      queue.push(card.id);
    }
  }

  if (queue.length === 0) {
    binder.updatedAt = new Date().toISOString();
    if (isLocalMode()) {
      await persistLocal(binder);
      announce();
      return binder;
    }
    await pushBinder(binder.id);
    return binder;
  }

  let page = 0;
  while (queue.length > 0) {
    if (page >= binder.pages) {
      if (binder.pages >= MAX_BINDER_PAGES) break;
      binder.pages += 1;
    }
    for (let row = 0; row < binder.rows && queue.length > 0; row++) {
      for (let col = 0; col < binder.columns && queue.length > 0; col++) {
        const key = slotKey(page, row, col);
        if (binder.slots[key]) continue;
        binder.slots[key] = queue.shift();
        // A fresh pocket holds one copy and is non-foil.
        delete binder.quantities[key];
        delete binder.foils[key];
      }
    }
    page += 1;
  }

  binder.updatedAt = new Date().toISOString();
  if (isLocalMode()) {
    await persistLocal(binder);
    announce();
    return binder;
  }
  await pushBinder(binder.id);
  return binder;
}

/** Sort orders the Binder Builder offers. */
export const BINDER_SORT_OPTIONS = [
  { id: 'name', label: 'Name' },
  { id: 'set', label: 'Set' },
  { id: 'quantity', label: 'Quantity' },
];

/** The comparable fields of a pocket's card (unloaded cards sort by id last). */
function cardSortFields(printingId) {
  const card = cardStore.getByPrintingId(printingId);
  if (!card) {
    // A printing that hasn't hydrated yet has no set/number to compare; push it
    // to the end of every order rather than letting its empty set sort first.
    return {
      name: printingId,
      set: '\uffff',
      setCode: '\uffff',
      number: Number.POSITIVE_INFINITY,
      collector: '',
    };
  }
  return {
    name: primaryName(card),
    // Sort by set *name* (not code) so a base set ("Final Fantasy") comes before
    // its modifier sets ("Final Fantasy Through the Ages"), which the set-code
    // order would otherwise invert.
    set: (card.set_name || card.set || '').toLowerCase(),
    setCode: (card.set || '').toLowerCase(),
    number: Number.parseInt(card.collector_number, 10),
    collector: String(card.collector_number || ''),
  };
}

function compareSortedEntries(a, b, sortKey) {
  if (sortKey === 'quantity') {
    if (b.qty !== a.qty) return b.qty - a.qty;
    return a.fields.name.localeCompare(b.fields.name);
  }
  if (sortKey === 'set') {
    if (a.fields.set !== b.fields.set) return a.fields.set.localeCompare(b.fields.set);
    if (a.fields.setCode !== b.fields.setCode)
      return a.fields.setCode.localeCompare(b.fields.setCode);
    const an = Number.isFinite(a.fields.number) ? a.fields.number : Number.POSITIVE_INFINITY;
    const bn = Number.isFinite(b.fields.number) ? b.fields.number : Number.POSITIVE_INFINITY;
    if (an !== bn) return an - bn;
    if (a.fields.collector !== b.fields.collector) {
      return a.fields.collector.localeCompare(b.fields.collector);
    }
    return a.fields.name.localeCompare(b.fields.name);
  }
  return a.fields.name.localeCompare(b.fields.name);
}

/**
 * Reorder a binder's occupied pockets in place (the empty pockets never move),
 * so a binder can be browsed by name, by set + collector number, or by how many
 * copies each pocket holds.
 *
 * @param {string} binderId
 * @param {string} sortKey one of {@link BINDER_SORT_OPTIONS}
 * @returns {Promise<object|null>} the updated binder
 */
export async function sortBinder(binderId, sortKey = 'name') {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder) return null;
  const key = BINDER_SORT_OPTIONS.some((option) => option.id === sortKey) ? sortKey : 'name';

  const keys = sortedSlotKeys(binder);
  if (keys.length < 2) return binder;

  const entries = keys.map((slot) => ({
    id: binder.slots[slot],
    qty: binder.quantities[slot] || 1,
    foil: Boolean(binder.foils[slot]),
    fields: cardSortFields(binder.slots[slot]),
  }));
  entries.sort((a, b) => compareSortedEntries(a, b, key));

  const slots = {};
  const quantities = {};
  const foils = {};
  keys.forEach((slot, index) => {
    const entry = entries[index];
    slots[slot] = entry.id;
    if (entry.qty > 1) quantities[slot] = entry.qty;
    if (entry.foil) foils[slot] = true;
  });
  binder.slots = slots;
  binder.quantities = quantities;
  binder.foils = foils;
  return commit(binder);
}

/**
 * Upload the visitor's device-local binders into the signed-in account and
 * clear the local copy. The server merge is an additive union by name, so a
 * failure is safe to retry — the records stay in IndexedDB until it succeeds.
 *
 * @returns {Promise<boolean>} true when local binders were merged and cleared.
 */
export async function mergeLocalBindersToAccount() {
  if (!mainState.loggedInUserId || mainState.shareToken) return false;

  const records = await loadLocalBinders();
  if (records.length === 0) return false;

  const merged = await apiMergeBinders(records.map((record) => toRecord(normalizeBinder(record))));
  applyBinders(merged);
  try {
    await clearLocalBinders();
  } catch (err) {
    console.error('Failed to clear local binders after merge:', err);
  }
  return true;
}

/** Drop every binder (used by tests/manual reset). */
export async function resetBinders() {
  binders.clear();
  activeId = null;
  pendingLoad = null;
  await clearLocalBinders();
  announce();
}
