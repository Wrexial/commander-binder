import { appState } from "../appState.js";
import { getOwnedCardObjects, isCardMissing } from "../cardState.js";

export function updateOwnedCounter() {
  const ownedCounter = document.getElementById("owned-counter");
  const searchInput = document.getElementById("search-input");
  if (!ownedCounter || !searchInput) return;

  const searchTerm = searchInput.value;

  const allCards = Array.from(document.querySelectorAll(".card"));
  const visibleCards = allCards.filter((card) => card.style.display !== "none");

  // Count owned cards from the visible set
  const ownedVisibleCount = visibleCards.filter(
    (card) => !isCardMissing(card.cardData)
  ).length;

  // Always show total owned relative to total cards
  const totalOwnedCount = getOwnedCardObjects().length;

  if (searchTerm) {
    ownedCounter.textContent = `Owned: ${ownedVisibleCount}/${visibleCards.length} shown (${totalOwnedCount} total)`;
  } else {
    ownedCounter.textContent = `Owned: ${totalOwnedCount}/${appState.seenNames.size}`;
  }
}
