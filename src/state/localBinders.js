/**
 * Guest/device persistence for Binder Builder layouts. A binder is a single
 * self-contained record (`{ id, name, columns, rows, pages, slots, ... }`) in
 * one IndexedDB store, so the slots map travels with the binder.
 */
import { createLocalRecordStore } from './localRecordStore.js';

const store = createLocalRecordStore({
  dbName: 'local-binders',
  storeName: 'binders',
  isValid: (row) => row && typeof row.id === 'string' && typeof row.name === 'string',
});

/** Every locally-saved binder record. */
export const loadLocalBinders = () => store.load();

/** Insert or replace a local binder record. */
export const saveLocalBinder = (binder) => store.put(binder);

/** Remove one local binder. */
export const removeLocalBinder = (id) => store.remove(id);

/** Drop every local binder. */
export const clearLocalBinders = () => store.clear();
