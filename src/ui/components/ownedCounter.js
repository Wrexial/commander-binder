import { appState } from "../../state/appState.js";
import { isCardOwned, getOwnedCardIds } from "../../state/cardState.js";

export function updateOwnedCounter() {
  const ownedCounter = document.getElementById("owned-counter");
  const searchInput = document.getElementById("search-input");
  if (!ownedCounter || !searchInput) return;

  const totalOwnedCount = getOwnedCardIds().size;

  // Fast path: with no search term we don't need to touch the DOM at all.
  // This is called on every rendered page (and after every toggle), so
  // scanning all cards here made loading quadratic.
  if (!searchInput.value) {
    ownedCounter.textContent = `Owned: ${totalOwnedCount}/${appState.seenNames.size}`;
    return;
  }

  const visibleCards = Array.from(document.querySelectorAll(".card")).filter(
    (card) => card.style.display !== "none"
  );

  const ownedVisibleCount = visibleCards.filter(
    (card) => isCardOwned(card.cardData)
  ).length;

  ownedCounter.textContent = `Owned: ${ownedVisibleCount}/${visibleCards.length} shown (${totalOwnedCount} total)`;
}
