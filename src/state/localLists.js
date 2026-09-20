/**
 * Guest persistence for custom lists. A signed-out visitor's lists live in one
 * IndexedDB store as self-contained records (`{ id, name, notes, isPublic,
 * cardIds, createdAt, updatedAt }`), mirroring the server's two-table shape in
 * a single object. They are uploaded (and cleared) on sign-in.
 */
import { createLocalRecordStore } from './localRecordStore.js';

const store = createLocalRecordStore({
  dbName: 'local-lists',
  storeName: 'lists',
  isValid: (row) => row && typeof row.id === 'string' && typeof row.name === 'string',
});

/** Every locally-saved list record. */
export const loadLocalLists = () => store.load();

/** Insert or replace a local list record. */
export const saveLocalList = (list) => store.put(list);

/** Remove one local list (its card ids live on the record, so this drops them too). */
export const removeLocalList = (id) => store.remove(id);

/** Drop every local list (after a successful merge). */
export const clearLocalLists = () => store.clear();
