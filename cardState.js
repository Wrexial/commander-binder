import {loggedInUserId} from './main.js';
import { updateOwnedCounter } from './ui/ownedCounter.js';

export const disabledCards = new Set();
let initialized = false;

export async function loadCardStates() {
  const res = await fetch("/.netlify/functions/disabled-cards", {
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
    disabledCards.add(cardId);
  }

  initialized = true;
}

export function isCardEnabled(card) {
  if (!initialized) return true;
  return !disabledCards.has(card.id);
}

export async function toggleCardEnabled(card) {
  const disable = isCardEnabled(card);

  if (disable) {
    disabledCards.add(card.id);
  } else {
    disabledCards.delete(card.id);
  }

  fetch("/.netlify/functions/toggle-card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: loggedInUserId, cardId: card.id, disable }),
  });

  updateOwnedCounter();

  return !disable;
}

export async function setCardsEnabled(cards, enabled) {
  for (const card of cards) {
    if (enabled) {
      disabledCards.delete(card.id);
    } else {
      disabledCards.add(card.id);
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
