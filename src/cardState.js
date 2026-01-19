import { updateOwnedCounter } from "./ui/ownedCounter.js";
import { getClerk } from './clerk.js';

const ownedCardData = new Map();
let initialized = false;

async function authenticatedFetch(url, options = {}) {
  const clerk = getClerk();
  const token = await clerk.session?.getToken();

  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export async function loadCardStates() {
  const userId = mainState.guestUserId || mainState.loggedInUserId;

  if (!userId) {
    initialized = true;
    return;
  }
  
  const options = {
    method: "POST",
    body: JSON.stringify({ userId }),
  };

  const res = await authenticatedFetch("/.netlify/functions/owned-cards", options);

  if (!res.ok) {
    initialized = true;
    return;
  }

  const rows = await res.json();
  const ownedCardIds = new Set(rows.map(({ cardId }) => cardId));

  if (ownedCardIds.has(card.id)) {
    ownedCardData.set(card.id, undefined);
  }
  initialized = true;
}

export function getOwnedCardObjects() {
  return Array.from(ownedCardData.values());
}

export function isCardMissing(card) {
  if (!initialized) return false;
  return !ownedCardData.has(card.id);
}

export async function toggleCardOwned(card) {
  const isOwned = !isCardMissing(card);

  if (isOwned) {
    ownedCardData.delete(card.id);
  } else {
    ownedCardData.set(card.id, card);
  }

  authenticatedFetch("/.netlify/functions/toggle-card", {
    method: "POST",
    body: JSON.stringify({
      cardId: card.id,
      isOwned: !isOwned,
    }),
  });

  updateOwnedCounter();

  return !isOwned;
}

export async function setCardsOwned(cards, owned) {
  for (const card of cards) {
    if (owned) {
      ownedCardData.set(card.id, card);
    } else {
      ownedCardData.delete(card.id);
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
  return Array.from(ownedCardData.keys());
}
