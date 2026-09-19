/**
 * The Binder Builder's binder registry.
 *
 * A binder is a named grid of physical pockets: `columns × rows` slots per
 * page, `pages` pages. Every slot is addressed by a `"page:row:col"` key and
 * holds one Scryfall printing id (or nothing). Unlike the browse grid — which
 * is generated from a Scryfall search — a binder is authored by the user, so it
 * is persisted on this device in IndexedDB and edited directly.
 *
 * The registry mirrors the local-collection/list modules: an in-memory Map is
 * the source of truth for the session and IndexedDB is best-effort storage.
 * Every mutation dispatches `binders:changed` so the editor and any badges can
 * refresh without importing this module's internals.
 */
import { getSetting } from './cardSettings.js';
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

async function persist(binder) {
  try {
    await saveLocalBinder(binder);
  } catch (err) {
    console.error('Failed to persist the binder:', err);
  }
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
  activeId = id;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* best effort */
  }
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

/** Load the device's binders; seeds one from the current grid settings. */
export async function loadBinders() {
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
  const now = new Date().toISOString();
  const binder = normalizeBinder({
    id: newId(),
    name: uniqueName(String(name || `Binder ${binders.size + 1}`).trim() || 'Binder'),
    columns,
    rows,
    pages,
    slots: {},
    createdAt: now,
    updatedAt: now,
  });

  binders.set(binder.id, binder);
  activeId = binder.id;
  try {
    localStorage.setItem(ACTIVE_KEY, binder.id);
  } catch {
    /* best effort */
  }
  await persist(binder);
  if (!silent) announce();
  return binder;
}

/** Patch a binder's name and/or dimensions. Out-of-range slots stay stored. */
export async function updateBinder(id, patch = {}) {
  const binder = binders.get(id);
  if (!binder) return null;

  if (patch.name != null) {
    const next = String(patch.name).trim().slice(0, 80);
    if (next) binder.name = next;
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
  await persist(binder);
  announce();
  return binder;
}

/** Delete a binder; a new empty one is seeded when the last is removed. */
export async function deleteBinder(id) {
  if (!binders.has(id)) return;
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

/** Place a printing in a slot (replacing whatever was there). */
export async function assignCardToSlot(binderId, key, printingId) {
  const binder = binders.get(binderId);
  if (!binder || !parseSlotKey(key) || typeof printingId !== 'string' || !printingId) return null;
  binder.slots[key] = printingId;
  binder.updatedAt = new Date().toISOString();
  await persist(binder);
  announce();
  return binder;
}

/** Empty one slot. */
export async function clearSlot(binderId, key) {
  const binder = binders.get(binderId);
  if (!binder || !(key in binder.slots)) return null;
  delete binder.slots[key];
  binder.updatedAt = new Date().toISOString();
  await persist(binder);
  announce();
  return binder;
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

  binder.updatedAt = new Date().toISOString();
  await persist(binder);
  announce();
  return binder;
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

  binder.updatedAt = new Date().toISOString();
  await persist(binder);
  announce();
  return binder;
}

/** Drop every binder (used by tests/manual reset). */
export async function resetBinders() {
  binders.clear();
  activeId = null;
  await clearLocalBinders();
  announce();
}
