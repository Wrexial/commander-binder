import { loggedInUserId } from "./main.js";
import { updateOwnedCounter } from "./ui/ownedCounter.js";

export const ownedCards = new Set();
let initialized = false;

export async function loadCardStates() {
  const res = await fetch("/.netlify/functions/owned-cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: loggedInUserId }),
  });
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

  fetch("/.netlify/functions/toggle-card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: loggedInUserId,
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

  fetch("/.netlify/functions/batch-toggle-cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: loggedInUserId,
      cardIds: cards.map((c) => c.id),
      disable: !enabled,
    }),
  });
  
  updateOwnedCounter();
}
