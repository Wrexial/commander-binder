
import { mainState } from "./main.js";
import { updateOwnedCounter } from "./ui/ownedCounter.js";
import { getClerk } from './clerk.js';

export const ownedCards = new Set();
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
  for (const { cardId } of rows) {
    ownedCards.add(cardId);
  }

  initialized = true;
}

export function isCardMissing(card) {
  if (!initialized) return false;
  return !ownedCards.has(card.id);
}

export async function toggleCardOwned(card) {
  const isOwned = !isCardMissing(card);

  if (isOwned) {
    ownedCards.delete(card.id);
  } else {
    ownedCards.add(card.id);
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
      ownedCards.add(card.id);
    } else {
      ownedCards.delete(card.id);
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
