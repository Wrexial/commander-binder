import { authenticatedFetch } from '../api/authenticatedFetch.js';
import { getClerk } from '../auth/clerk.js';
import { loadLocalCollection } from './localCollection.js';

/**
 * The signed-in visitor's own collection, loaded separately from the share
 * view's owner collection. Share mode pins `cardState` to the owner (via the
 * share token), so the viewer's collection has to be fetched independently for
 * the comparison.
 */
const viewerIds = new Set();

/** True when a Clerk session could supply the viewer's own collection. */
function isSignedIn() {
  return Boolean(getClerk()?.user);
}

/**
 * Load the viewer's own collection. Signed-in viewers read from the server
 * (no share token, so `owned-cards` resolves the verified Clerk identity);
 * signed-out viewers read the device-local collection.
 *
 * @returns {Promise<Set<string>>} the viewer's printing ids
 */
export async function loadViewerCollection() {
  viewerIds.clear();

  if (isSignedIn()) {
    try {
      const res = await authenticatedFetch('/.netlify/functions/owned-cards', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          rows.forEach(({ cardId }) => {
            if (typeof cardId === 'string') viewerIds.add(cardId);
          });
        }
      }
    } catch (err) {
      console.error("Failed to load the viewer's collection for comparison:", err);
    }
    return viewerIds;
  }

  try {
    const rows = await loadLocalCollection();
    rows.forEach(({ cardId }) => {
      if (typeof cardId === 'string') viewerIds.add(cardId);
    });
  } catch (err) {
    console.error('Failed to load the local collection for comparison:', err);
  }

  return viewerIds;
}

/** The last loaded viewer collection ids. */
export function getViewerCollectionIds() {
  return viewerIds;
}
