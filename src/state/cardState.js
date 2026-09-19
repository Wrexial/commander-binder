import { mainState } from './mainState.js';
import { cardStore } from './cardStore.js';
import { authenticatedFetch } from '../api/authenticatedFetch.js';
import { mergeOwnedCollection } from '../api/mergeOwned.js';
import {
  addLocalCard,
  clearLocalCollection,
  loadLocalCollection,
  removeLocalCards,
} from './localCollection.js';

const ownedCardIds = new Set();

/** Printing id -> ISO timestamp of when it was marked owned (best effort). */
const ownedAddedAt = new Map();

let initialized = false;

/**
 * True for a signed-out visitor with no share token: they track their own
 * collection on this device instead of the server.
 */
function isLocalMode() {
  return !mainState.loggedInUserId && !mainState.shareToken;
}

export async function loadCardStates() {
  if (isLocalMode()) {
    try {
      const rows = await loadLocalCollection();
      rows.forEach(({ cardId, addedAt }) => {
        ownedCardIds.add(cardId);
        if (addedAt) ownedAddedAt.set(cardId, String(addedAt));
      });
    } catch (err) {
      console.error('Failed to load the local collection:', err);
    } finally {
      // Always mark initialization complete so isCardOwned() returns a
      // deterministic result even if storage failed.
      initialized = true;
    }
    return;
  }

  try {
    // Signed-in callers are resolved server-side from their token; guests pass
    // the share token instead. Neither ever sends a raw user id.
    const body = mainState.loggedInUserId ? {} : { shareToken: mainState.shareToken };

    const res = await authenticatedFetch('/.netlify/functions/owned-cards', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) return;

    const rows = await res.json();
    rows.forEach(({ cardId, createdAt }) => {
      ownedCardIds.add(cardId);
      if (createdAt) ownedAddedAt.set(cardId, String(createdAt));
    });
  } catch (err) {
    console.error('Failed to load owned cards:', err);
  } finally {
    // Always mark initialization complete so isCardOwned() returns a
    // deterministic result even if the request failed.
    initialized = true;
  }
}

export function isCardOwned(card) {
  if (!initialized) return false;
  if (ownedCardIds.has(card.id)) return true;

  // The UI shows one card per name (the oldest printing). A saved collection
  // may have marked a different printing of that name, so treat the card as
  // owned when any of its loaded printings has been saved.
  return cardStore.getPrintings(card.name).some((p) => ownedCardIds.has(p.id));
}

export async function toggleCardOwned(card) {
  if (isLocalMode()) return toggleLocalCardOwned(card);

  const wasOwned = isCardOwned(card);

  if (wasOwned) {
    // Unmark every printing of this name so the card is fully un-owned.
    const ids = new Set([card.id, ...cardStore.getPrintings(card.name).map((p) => p.id)]);

    await persistOwned('/.netlify/functions/batch-toggle-cards', {
      cardIds: Array.from(ids),
      isOwned: false,
    });
    ids.forEach((id) => {
      ownedCardIds.delete(id);
      ownedAddedAt.delete(id);
    });
  } else {
    await persistOwned('/.netlify/functions/toggle-card', {
      cardId: card.id,
      isOwned: true,
    });
    ownedCardIds.add(card.id);
    ownedAddedAt.set(card.id, new Date().toISOString());
  }

  return !wasOwned;
}

export async function setCardsOwned(cards, owned) {
  if (isLocalMode()) return setLocalCardsOwned(cards, owned);

  await persistOwned('/.netlify/functions/batch-toggle-cards', {
    cardIds: cards.map((c) => c.id),
    isOwned: owned,
  });

  for (const card of cards) {
    if (owned) {
      ownedCardIds.add(card.id);
      ownedAddedAt.set(card.id, new Date().toISOString());
    } else {
      ownedCardIds.delete(card.id);
      ownedAddedAt.delete(card.id);
    }
  }
}

/**
 * Toggle ownership for a signed-out visitor. The in-memory set is authoritative
 * for the session; IndexedDB is a best-effort mirror so the marks survive a
 * reload. As with the server path, unmarking clears every printing of the name.
 *
 * @param {object} card
 * @returns {Promise<boolean>} the new owned state
 */
async function toggleLocalCardOwned(card) {
  const wasOwned = isCardOwned(card);
  const ids = new Set([card.id, ...cardStore.getPrintings(card.name).map((p) => p.id)]);

  if (wasOwned) {
    ids.forEach((id) => {
      ownedCardIds.delete(id);
      ownedAddedAt.delete(id);
    });
    await persistLocal(() => removeLocalCards(ids));
  } else {
    const addedAt = new Date().toISOString();
    ownedCardIds.add(card.id);
    ownedAddedAt.set(card.id, addedAt);
    await persistLocal(() => addLocalCard(card.id, addedAt));
  }

  return !wasOwned;
}

/**
 * Apply an owned/missing change to a batch of cards for a signed-out visitor.
 * @param {object[]} cards
 * @param {boolean} owned
 */
async function setLocalCardsOwned(cards, owned) {
  if (owned) {
    const addedAt = new Date().toISOString();
    for (const card of cards) {
      ownedCardIds.add(card.id);
      ownedAddedAt.set(card.id, addedAt);
    }
    await persistLocal(() => Promise.all(cards.map((c) => addLocalCard(c.id, addedAt))));
  } else {
    for (const card of cards) {
      ownedCardIds.delete(card.id);
      ownedAddedAt.delete(card.id);
    }
    await persistLocal(() => removeLocalCards(cards.map((c) => c.id)));
  }
}

/**
 * Upload the visitor's local collection into the signed-in account and clear
 * the local copy. The server merge is a union (never removes), so a failure is
 * safe to retry — the records stay in IndexedDB until a merge fully succeeds.
 *
 * @returns {Promise<boolean>} true when local records were merged and cleared.
 */
export async function mergeLocalCollectionToAccount() {
  if (!mainState.loggedInUserId) return false;

  const rows = await loadLocalCollection();
  if (rows.length === 0) return false;

  await mergeOwnedCollection(rows.map((row) => row.cardId));
  await clearLocalCollection();
  return true;
}

/**
 * Send an owned-card mutation and surface a failure to the caller. Local state
 * is only updated once the request succeeds, so a network error can't leave the
 * UI claiming a card was saved when it was not.
 * @param {string} path
 * @param {object} body
 */
async function persistOwned(path, body) {
  const res = await authenticatedFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to update owned cards (${res.status})`);
  }
}

/**
 * Run a local persistence step without letting a storage failure break a
 * toggle: the in-memory set already reflects the action for this session.
 * @param {() => Promise<unknown>} run
 */
async function persistLocal(run) {
  try {
    await run();
  } catch (err) {
    console.error('Failed to persist the local collection:', err);
  }
}

export function getOwnedCardIds() {
  return ownedCardIds;
}

/**
 * Printing id -> ISO timestamp of when it was marked owned. Used by the
 * "Recent additions" log; entries are absent for cards loaded before this was
 * tracked or when the server did not report a time.
 */
export function getOwnedAddedAt() {
  return ownedAddedAt;
}
