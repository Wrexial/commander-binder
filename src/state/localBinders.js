/**
 * Guest/device persistence for Binder Builder layouts. A binder is a single
 * self-contained record (`{ id, name, columns, rows, pages, slots, ... }`) in
 * one IndexedDB store, so the slots map travels with the binder.
 *
 * `createStore` resolves `null`/`[]`/`false` when IndexedDB is unavailable
 * (jsdom, private mode), so callers keep an in-memory copy as the source of
 * truth and treat this module as best-effort persistence.
 */
import { createStore } from '../utils/idb.js';

const store = createStore({ dbName: 'local-binders', storeName: 'binders', keyPath: 'id' });

/** Every locally-saved binder record. */
export async function loadLocalBinders() {
  const rows = await store.getAll();
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row.id === 'string' && typeof row.name === 'string');
}

/** Insert or replace a local binder record. */
export async function saveLocalBinder(binder) {
  return store.put(binder);
}

/** Remove one local binder. */
export async function removeLocalBinder(id) {
  return store.remove(id);
}

/** Drop every local binder. */
export async function clearLocalBinders() {
  return store.clear();
}
