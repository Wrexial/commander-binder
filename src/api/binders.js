import { authenticatedFetch } from './authenticatedFetch.js';

const READ_PATH = '/.netlify/functions/binders';
const MANAGE_PATH = '/.netlify/functions/manage-binder';
const MERGE_PATH = '/.netlify/functions/merge-binders';

/**
 * POST a JSON body to a binder endpoint and return the caller's full binder set.
 * Every mutation returns the whole set (like `lists`), so the client adopts
 * server truth without a second round trip.
 */
async function requestBinders(path, body) {
  const res = await authenticatedFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data.message === 'string') message = data.message;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(message);
  }

  const data = await res.json();
  return Array.isArray(data?.binders) ? data.binders : [];
}

/** Load the caller's binders. */
export function fetchBinders() {
  return requestBinders(READ_PATH, {});
}

/** Create a binder. */
export function createBinder({ name, columns, rows, pages, slots }) {
  return requestBinders(MANAGE_PATH, { action: 'create', name, columns, rows, pages, slots });
}

/** Rename/edit/re-dimension a binder and/or replace its slots. */
export function updateBinder(binderId, { name, columns, rows, pages, slots }) {
  return requestBinders(MANAGE_PATH, {
    action: 'update',
    binderId,
    name,
    columns,
    rows,
    pages,
    slots,
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
