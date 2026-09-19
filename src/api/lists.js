import { authenticatedFetch } from './authenticatedFetch.js';

const READ_PATH = '/.netlify/functions/lists';
const MANAGE_PATH = '/.netlify/functions/manage-list';
const ITEMS_PATH = '/.netlify/functions/list-items';
const MERGE_PATH = '/.netlify/functions/merge-lists';

/**
 * POST a JSON body to a list endpoint and return the caller's full list set.
 * Every list mutation returns the whole set (like `merge-owned` returns the
 * whole collection), so the client can adopt server truth without a second
 * round trip.
 */
async function requestLists(path, body) {
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
  return Array.isArray(data?.lists) ? data.lists : [];
}

/**
 * Load the caller's lists. A `shareToken` yields the owner's public lists only;
 * otherwise the verified Clerk identity is used server-side.
 */
export function fetchLists({ shareToken } = {}) {
  return requestLists(READ_PATH, shareToken ? { shareToken } : {});
}

/** Create a list. */
export function createList({ name, notes, isPublic }) {
  return requestLists(MANAGE_PATH, { action: 'create', name, notes, isPublic });
}

/** Rename/edit a list. */
export function updateList(listId, { name, notes, isPublic }) {
  return requestLists(MANAGE_PATH, { action: 'update', listId, name, notes, isPublic });
}

/** Delete a list (its membership cascades server-side). */
export function deleteList(listId) {
  return requestLists(MANAGE_PATH, { action: 'delete', listId });
}

/** Add printings to a list. */
export function addListItems(listId, cardIds) {
  return requestLists(ITEMS_PATH, { action: 'add', listId, cardIds });
}

/** Remove printings from a list. */
export function removeListItems(listId, cardIds) {
  return requestLists(ITEMS_PATH, { action: 'remove', listId, cardIds });
}

/** Union device-local lists into the signed-in account. */
export function mergeLists(lists) {
  return requestLists(MERGE_PATH, { lists });
}
