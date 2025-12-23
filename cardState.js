import {loggedInUserId} from './main.js';

const disabledSet = new Set();
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
    disabledSet.add(cardId);
  }

  initialized = true;
}

export function isCardEnabled(card) {
  if (!initialized) return true;
  return !disabledSet.has(card.id);
}

export async function toggleCardEnabled(card) {
  const disable = isCardEnabled(card);

  if (disable) {
    disabledSet.add(card.id);
  } else {
    disabledSet.delete(card.id);
  }

  fetch("/.netlify/functions/toggle-card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: loggedInUserId, cardId: card.id, disable }),
  });

  return !disable;
}

export async function setCardsEnabled(cards, enabled) {
  for (const card of cards) {
    if (enabled) {
      disabledSet.delete(card.id);
    } else {
      disabledSet.add(card.id);
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
}
