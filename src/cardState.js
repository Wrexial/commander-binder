import { updateOwnedCounter } from "./ui/ownedCounter.js";
import { getClerk } from './clerk.js';
import { mainState } from "./main.js";

const ownedCardIds = new Set();
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
  rows.forEach(({ cardId }) => ownedCardIds.add(cardId));

  initialized = true;
}

export function isCardOwned(card) {
  if (!initialized) return false;
  return ownedCardIds.has(card.id);
}

export async function toggleCardOwned(card) {
  const isOwned = isCardOwned(card);

  if (isOwned) {
    ownedCardIds.delete(card.id);
  } else {
    ownedCardIds.add(card.id);
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