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

function normalizeBinder(record) {
  const now = new Date().toISOString();
  return {
    id: String(record.id),
    name: String(record.name || 'Binder').slice(0, 80),
    columns: clampInt(record.columns, MIN_BINDER_COLUMNS, MAX_BINDER_COLUMNS, 3),
    rows: clampInt(record.rows, MIN_BINDER_ROWS, MAX_BINDER_ROWS, 3),
    pages: clampInt(record.pages, 1, MAX_BINDER_PAGES, 1),
    isPublic: Boolean(record.isPublic),
    slots: sanitizeSlots(record.slots),
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
    await saveLocalBinder(binder);
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
 * Every pocket's card, one entry per slot and in slot order — duplicates
 * included. Statistics uses this so three Sol Rings count as three cards.
 *
 * @param {string} binderId
 * @returns {Array<{id: string, name: string}>}
 */
export function getBinderSlotCards(binderId) {
  const binder = binders.get(binderId);
  if (!binder) return [];

  return sortedSlotKeys(binder).map((key) => {
    const printingId = binder.slots[key];
    return cardStore.getByPrintingId(printingId) || { id: printingId, name: printingId };
  });
}

/**
 * The member cards of a binder, one per card name, in slot order. Unloaded
 * printings fall back to a bare `{ id, name }` so an export never loses a row.
 *
 * @param {string} binderId
 * @returns {Array<{id: string, name: string}>}
 */
export function getBinderCards(binderId) {
  const binder = binders.get(binderId);
  if (!binder) return [];

  const seen = new Set();
  const cards = [];
  for (const key of sortedSlotKeys(binder)) {
    const printingId = binder.slots[key];
    const card = cardStore.getByPrintingId(printingId);
    const name = card ? primaryName(card) : printingId;
    if (seen.has(name)) continue;
    seen.add(name);
    cards.push(card || { id: printingId, name: printingId });
  }
  return cards;
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

/** Load binders from whichever source applies; seeds one from current settings. */
/**
 * Load binders from whichever source applies. `seed` creates a default binder
 * when the caller has none (the Binder Builder page wants one; the browse page's
 * bulk modals only need to list existing binders).
 * @param {{seed?: boolean}} [options]
 */
export async function loadBinders({ seed = true } = {}) {
  if (isShareMode()) {
    try {
      applyBinders(await fetchBinders({ shareToken: mainState.shareToken }));
    } catch (err) {
      console.error('Failed to load shared binders:', err);
      binders.clear();
    }
  } else if (isLocalMode()) {
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
  } else {
    try {
      applyBinders(await fetchBinders());
    } catch (err) {
      console.error('Failed to load binders:', err);
      binders.clear();
    }
  }

  try {
    activeId = localStorage.getItem(ACTIVE_KEY);
  } catch {
    activeId = null;
  }

  if (binders.size === 0 && seed && canEditBinders()) {
    await createBinder({
      name: 'Binder 1',
      columns: clampInt(getSetting('gridColumns'), 1, MAX_BINDER_COLUMNS, 3),
      rows: clampInt(getSetting('gridRows'), 1, MAX_BINDER_ROWS, 3),
      pages: clampInt(getSetting('pagesPerBinder'), 1, MAX_BINDER_PAGES, 1),
      silent: true,
    });
  }

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
        await apiCreateBinder({ name: nextName, ...dims, isPublic: publicFlag, slots: {} })
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
  // queue the rest so they can be shifted into the freed pockets.
  const keptSlots = {};
  const displaced = [];
  for (const key of sortedSlotKeys(binder)) {
    const parsed = parseSlotKey(key);
    if (!parsed) continue;
    if (parsed.page < pages && parsed.row < rows && parsed.col < columns) {
      keptSlots[key] = binder.slots[key];
    } else {
      displaced.push(binder.slots[key]);
    }
  }

  // Shift displaced cards into the first free pockets, page → row → column.
  const slots = { ...keptSlots };
  let placed = 0;
  for (let page = 0; page < pages && placed < displaced.length; page++) {
    for (let row = 0; row < rows && placed < displaced.length; row++) {
      for (let col = 0; col < columns && placed < displaced.length; col++) {
        const key = slotKey(page, row, col);
        if (slots[key]) continue;
        slots[key] = displaced[placed++];
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
      for (const printingId of remaining) {
        let key = firstEmptySlotKey(fallback);
        if (!key) {
          if (fallback.pages >= MAX_BINDER_PAGES) {
            console.error('Could not place an overflow card; binder is full:', printingId);
            continue;
          }
          fallback.pages += 1;
          key = slotKey(fallback.pages - 1, 0, 0);
        }
        fallback.slots[key] = printingId;
      }
      await commit(fallback, { silent: true });
      break;
    }

    remaining = remaining.slice(chunk.length);
    const target = binders.get(created.id) || created;
    chunk.forEach((printingId, index) => {
      const page = Math.floor(index / perPage);
      const within = index % perPage;
      target.slots[slotKey(page, Math.floor(within / columns), within % columns)] = printingId;
    });
    await commit(target, { silent: true });
    overflowBinders.push({ id: target.id, name: target.name, count: chunk.length });
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

/** Place a printing in a slot (replacing whatever was there). */
export async function assignCardToSlot(binderId, key, printingId) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder || !parseSlotKey(key) || typeof printingId !== 'string' || !printingId) return null;
  binder.slots[key] = printingId;
  return commit(binder);
}

/** Empty one slot. */
export async function clearSlot(binderId, key) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder || !(key in binder.slots)) return null;
  delete binder.slots[key];
  return commit(binder);
}

/** Move a card to another slot, swapping when the target already holds one. */
export async function moveSlot(binderId, fromKey, toKey) {
  if (!canEditBinders()) return null;
  const binder = binders.get(binderId);
  if (!binder || fromKey === toKey) return null;
  if (!parseSlotKey(fromKey) || !parseSlotKey(toKey)) return null;

  const moving = binder.slots[fromKey];
  if (!moving) return null;

  const target = binder.slots[toKey];
  binder.slots[toKey] = moving;
  if (target) binder.slots[fromKey] = target;
  else delete binder.slots[fromKey];

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

  let targetKey = firstEmptySlotKey(to);
  if (!targetKey) {
    if (to.pages >= MAX_BINDER_PAGES) return null;
    to.pages += 1;
    targetKey = slotKey(to.pages - 1, 0, 0);
  }

  delete from.slots[fromKey];
  to.slots[targetKey] = printingId;

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
      changed = true;
    }
  }
  if (!changed) return binder;

  return commit(binder);
}

/**
 * Add a batch of cards to a binder, filling the first empty pockets in slot
 * order and growing the page count when it runs out of room (up to
 * `MAX_BINDER_PAGES`). Cards already anywhere in the binder are skipped.
 *
 * @param {string} binderId
 * @param {object[]} cards
 * @returns {Promise<object|null>} the updated binder
 */
export async function addCardsToBinder(binderId, cards) {
  if (!canEditBinders()) throw new Error('Binders are read-only in a shared view.');
  const binder = binders.get(binderId);
  if (!binder) throw new Error('Binder not found.');

  const presentIds = new Set(Object.values(binder.slots));
  const queue = (Array.isArray(cards) ? cards : [cards]).filter(
    (card) => card && card.id && !presentIds.has(card.id)
  );
  if (queue.length === 0) return binder;

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
        binder.slots[key] = queue.shift().id;
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
  await clearLocalBinders();
  announce();
}
