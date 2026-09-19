/**
 * Guest persistence for custom lists. A signed-out visitor's lists live in one
 * IndexedDB store as self-contained records (`{ id, name, notes, isPublic,
 * cardIds, createdAt, updatedAt }`), mirroring the server's two-table shape in
 * a single object. They are uploaded (and cleared) on sign-in.
 *
 * `createStore` resolves `null`/`[]`/`false` when IndexedDB is unavailable
 * (jsdom, private mode), so callers keep an in-memory copy as the source of
 * truth and treat this module as best-effort persistence.
 */
import { createStore } from '../utils/idb.js';

const store = createStore({ dbName: 'local-lists', storeName: 'lists', keyPath: 'id' });

/** Every locally-saved list record. */
export async function loadLocalLists() {
  const rows = await store.getAll();
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row.id === 'string' && typeof row.name === 'string');
}

/** Insert or replace a local list record. */
export async function saveLocalList(list) {
  return store.put(list);
}

/** Remove one local list (its card ids live on the record, so this drops them too). */
export async function removeLocalList(id) {
  return store.remove(id);
}

/** Drop every local list (after a successful merge). */
export async function clearLocalLists() {
  return store.clear();
}
