import { appState } from '../../state/appState.js';
import { isCardOwned, getOwnedCardIds } from '../../state/cardState.js';
import { activeFilterCount } from '../../state/filters.js';

export function updateOwnedCounter() {
  const ownedCounter = document.getElementById('owned-counter');
  const searchInput = document.getElementById('search-input');
  if (!ownedCounter || !searchInput) return;

  const totalOwnedCount = getOwnedCardIds().size;

  // Fast path: with no search term *and* no filters we don't need to touch the
  // DOM at all. This is called on every rendered page (and after every toggle),
  // so scanning all cards here made loading quadratic.
  if (!searchInput.value && activeFilterCount() === 0) {
    ownedCounter.textContent = `Owned: ${totalOwnedCount}/${appState.seenNames.size}`;
    return;
  }

  let visibleCount = 0;
  let ownedVisibleCount = 0;
  document.querySelectorAll('.card').forEach((card) => {
    if (card.style.display === 'none') return;
    visibleCount++;
    if (isCardOwned(card.cardData)) ownedVisibleCount++;
  });

  // Keep it short: the pill sits beside the filter button on mobile, where the
  // "shown (N total)" suffix overflowed the toolbar.
  ownedCounter.textContent = `Owned: ${ownedVisibleCount}/${visibleCount}`;
}
