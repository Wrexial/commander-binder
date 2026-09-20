import { createRegistryRequest } from './registryClient.js';

const READ_PATH = '/.netlify/functions/binders';
const MANAGE_PATH = '/.netlify/functions/manage-binder';
const MERGE_PATH = '/.netlify/functions/merge-binders';

/** POST to a binder endpoint and unwrap the caller's full (fresh) binder set. */
const requestBinders = createRegistryRequest('binders');

/** Load the caller's binders, or the owner's public binders for a share token. */
export function fetchBinders({ shareToken } = {}) {
  return requestBinders(READ_PATH, shareToken ? { shareToken } : {});
}

/** Create a binder. */
export function createBinder({ name, columns, rows, pages, slots, isPublic }) {
  return requestBinders(MANAGE_PATH, {
    action: 'create',
    name,
    columns,
    rows,
    pages,
    slots,
    isPublic,
  });
}

/** Rename/edit/re-dimension a binder and/or replace its slots and visibility. */
export function updateBinder(binderId, { name, columns, rows, pages, slots, isPublic }) {
  return requestBinders(MANAGE_PATH, {
    action: 'update',
    binderId,
    name,
    columns,
    rows,
    pages,
    slots,
    isPublic,
  });
}

/** Delete a binder. */
export function deleteBinder(binderId) {
  return requestBinders(MANAGE_PATH, { action: 'delete', binderId });
}

/** Union device-local binders into the signed-in account. */
export function mergeBinders(binders) {
  return requestBinders(MERGE_PATH, { binders });
}
