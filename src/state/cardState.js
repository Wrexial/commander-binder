import { updateOwnedCounter } from "../ui/components/ownedCounter.js";
import { mainState } from "../main.js";
import { cardStore } from './cardStore.js';
import { authenticatedFetch } from '../api/authenticatedFetch.js';

const ownedCardIds = new Set();
let initialized = false;

export async function loadCardStates() {
  if (!mainState.loggedInUserId && !mainState.shareToken) {
    initialized = true;
    return;
  }

  try {
    // Signed-in callers are resolved server-side from their token; guests pass
    // the share token instead. Neither ever sends a raw user id.
    const body = mainState.loggedInUserId
      ? {}
      : { shareToken: mainState.shareToken };

    const res = await authenticatedFetch("/.netlify/functions/owned-cards", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) return;

    const rows = await res.json();
    rows.forEach(({ cardId }) => ownedCardIds.add(cardId));
  } catch (err) {
    console.error("Failed to load owned cards:", err);
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
  return cardStore.getPrintings(card.name).some(p => ownedCardIds.has(p.id));
}

export async function toggleCardOwned(card) {
  const wasOwned = isCardOwned(card);

  if (wasOwned) {
    // Unmark every printing of this name so the card is fully un-owned.
    const ids = new Set([card.id, ...cardStore.getPrintings(card.name).map(p => p.id)]);
    ids.forEach(id => ownedCardIds.delete(id));

    authenticatedFetch("/.netlify/functions/batch-toggle-cards", {
      method: "POST",
      body: JSON.stringify({
        cardIds: Array.from(ids),
        isOwned: false,
      }),
    });
  } else {
    ownedCardIds.add(card.id);

    authenticatedFetch("/.netlify/functions/toggle-card", {
      method: "POST",
      body: JSON.stringify({
        cardId: card.id,
        isOwned: true,
      }),
    });
  }

  updateOwnedCounter();

  return !wasOwned;
}

export async function setCardsOwned(cards, owned) {
  for (const card of cards) {
    if (owned) {
      ownedCardIds.add(card.id);
    } else {
      ownedCardIds.delete(card.id);
    }
  }

  authenticatedFetch("/.netlify/functions/batch-toggle-cards", {
    method: "POST",
    body: JSON.stringify({
      cardIds: cards.map((c) => c.id),
      isOwned: owned,
    }),
  });
  
  updateOwnedCounter();
}

export function getOwnedCardIds() {
  return ownedCardIds;
}