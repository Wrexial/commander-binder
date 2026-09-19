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

const ACTIVE_KEY = 'activeBinderId';

/** Hard caps so a malformed stored/synced record can't create a huge grid. */
export const MAX_BINDER_COLUMNS = 16;
export const MAX_BINDER_ROWS = 16;
export const MAX_BINDER_PAGES = 200;
const MIN_BINDER_COLUMNS = 1;
const MIN_BINDER_ROWS = 1;

/** id -> binder record */
const binders = new Map();
let initialized = false;
let activeId = null;

/** Serializes server writes so responses can't land out of order. */
let writeQueue = Promise.resolve();

function enqueue(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function announce() {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('binders:changed'));
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `binder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Signed-out (or share-link) visitors track binders on this device. */
function isLocalMode() {
  return !mainState.loggedInUserId;
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
  initialized = true;
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
export async function loadBinders() {
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
  } else {
    try {
      applyBinders(await fetchBinders());
    } catch (err) {
      console.error('Failed to load binders:', err);
      binders.clear();
      initialized = true;
    }
  }

  try {
    activeId = localStorage.getItem(ACTIVE_KEY);
  } catch {
    activeId = null;
  }

  if (binders.size === 0) {
    await createBinder({
      name: 'Binder 1',
      columns: clampInt(getSetting('gridColumns'), 1, MAX_BINDER_COLUMNS, 3),
      rows: clampInt(getSetting('gridRows'), 1, MAX_BINDER_ROWS, 3),
      pages: clampInt(getSetting('pagesPerBinder'), 1, MAX_BINDER_PAGES, 1),
      silent: true,
    });
  }

  initialized = true;
  announce();
  return getBinders();
}

export function areBindersLoaded() {
  return initialized;
}

/**
 * Create a binder and make it active.
 * @param {{name?: string, columns?: number, rows?: number, pages?: number, silent?: boolean}} input
 */
export async function createBinder({
  name,
  columns = 3,
  rows = 3,
  pages = 1,
  silent = false,
} = {}) {
  const nextName = uniqueName(String(name || `Binder ${binders.size + 1}`).trim() || 'Binder');
  const dims = {
    columns: clampInt(columns, MIN_BINDER_COLUMNS, MAX_BINDER_COLUMNS, 3),
    rows: clampInt(rows, MIN_BINDER_ROWS, MAX_BINDER_ROWS, 3),
    pages: clampInt(pages, 1, MAX_BINDER_PAGES, 1),
  };

  if (!isLocalMode()) {
    let created = null;
    try {
      applyBinders(await apiCreateBinder({ name: nextName, ...dims, slots: {} }));
      created = getBinderByName(nextName);
    } catch (err) {
      console.error('Failed to create the binder:', err);
    }
    if (created) rememberActive(created.id);
    return created;
  }

  const now = new Date().toISOString();
  const binder = normalizeBinder({
    id: newId(),
    name: nextName,
    ...dims,
    slots: {},
    createdAt: now,
    updatedAt: now,
  });

  binders.set(binder.id, binder);
  rememberActive(binder.id);
  await persistLocal(binder);
  if (!silent) announce();
  return binder;
}

/** Patch a binder's name and/or dimensions. Out-of-range slots stay stored. */
export async function updateBinder(id, patch = {}) {
  const binder = binders.get(id);
  if (!binder) return null;

  if (patch.name != null) {
    const next = String(patch.name).trim().slice(0, 80);
    const clash =
      next &&
      getBinders().some((item) => item.id !== id && item.name.toLowerCase() === next.toLowerCase());
    if (next && !clash) binder.name = next;
  }
  if (patch.columns != null) {
    binder.columns = clampInt(
      patch.columns,
      MIN_BINDER_COLUMNS,
      MAX_BINDER_COLUMNS,
      binder.columns
    );
  }
  if (patch.rows != null) {
    binder.rows = clampInt(patch.rows, MIN_BINDER_ROWS, MAX_BINDER_ROWS, binder.rows);
  }
  if (patch.pages != null) {
    binder.pages = clampInt(patch.pages, 1, MAX_BINDER_PAGES, binder.pages);
  }

  binder.updatedAt = new Date().toISOString();

  if (isLocalMode()) {
    await persistLocal(binder);
    announce();
    return binder;
  }

  await pushBinder(id);
  return binder;
}

/** Delete a binder; a new empty one is seeded when the last is removed. */
export async function deleteBinder(id) {
  if (!binders.has(id)) return;

  if (!isLocalMode()) {
    try {
      applyBinders(await apiDeleteBinder(id));
    } catch (err) {
      console.error('Failed to delete the binder:', err);
      return;
    }
    if (activeId === id) activeId = getBinders()[0]?.id || null;
    if (binders.size === 0) {
      await createBinder({ name: 'Binder 1', columns: 3, rows: 3, pages: 1, silent: true });
    }
    announce();
    return;
  }

  binders.delete(id);
  try {
    await removeLocalBinder(id);
  } catch (err) {
    console.error('Failed to remove the local binder:', err);
  }

  if (activeId === id) activeId = getBinders()[0]?.id || null;

  if (binders.size === 0) {
    await createBinder({ name: 'Binder 1', columns: 3, rows: 3, pages: 1, silent: true });
  }
  announce();
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
  const binder = binders.get(binderId);
  if (!binder || !parseSlotKey(key) || typeof printingId !== 'string' || !printingId) return null;
  binder.slots[key] = printingId;
  return commit(binder);
}

/** Empty one slot. */
export async function clearSlot(binderId, key) {
  const binder = binders.get(binderId);
  if (!binder || !(key in binder.slots)) return null;
  delete binder.slots[key];
  return commit(binder);
}

/** Move a card to another slot, swapping when the target already holds one. */
export async function moveSlot(binderId, fromKey, toKey) {
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

/** Empty every slot on one page. */
export async function clearPage(binderId, page) {
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
 * Upload the visitor's device-local binders into the signed-in account and
 * clear the local copy. The server merge is an additive union by name, so a
 * failure is safe to retry — the records stay in IndexedDB until it succeeds.
 *
 * @returns {Promise<boolean>} true when local binders were merged and cleared.
 */
export async function mergeLocalBindersToAccount() {
  if (!mainState.loggedInUserId) return false;

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
  initialized = false;
  await clearLocalBinders();
  announce();
}
