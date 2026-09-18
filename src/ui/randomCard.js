// src/ui/randomCard.js
/**
 * "Surprise me" — jump to a random card the collector does not own yet. A fun
 * way to browse a chronological feed without scrolling, and a gentle nudge
 * toward the next addition to the collection.
 */
import { cardStore } from '../state/cardStore.js';
import { isCardOwned } from '../state/cardState.js';
import { showToast } from './components/toast.js';

/** How long the target tile stays highlighted. */
const HIGHLIGHT_MS = 2000;

/**
 * Pick one entry at random. Returns `null` for an empty list.
 *
 * @template T
 * @param {T[]} items
 * @param {() => number} [random] Injectable RNG, for tests.
 * @returns {T|null}
 */
export function pickRandom(items, random = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

/** Locate the mounted tile for a card, matched by its display name. */
function findCardElement(card) {
  for (const element of document.querySelectorAll('.card')) {
    if (element.cardData?.name === card.name) return element;
  }
  return null;
}

/** Expand any collapsed ancestors, scroll the tile into view and flash it. */
function revealCard(element) {
  element.closest('.section')?.classList.remove('collapsed');
  element.closest('.binder')?.classList.remove('collapsed');
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  element.classList.add('card-surprise');
  window.setTimeout(() => element.classList.remove('card-surprise'), HIGHLIGHT_MS);
}

/** Jump to a random missing card, or explain why there is nothing to show. */
export function surpriseMe() {
  const all = cardStore.getAll();
  if (all.length === 0) {
    showToast('No cards have loaded yet. Scroll the grid first.', 'warning');
    return;
  }

  const missing = all.filter((card) => !isCardOwned(card));
  const target = pickRandom(missing);

  if (!target) {
    showToast('Nothing missing to surprise you with — your collection is complete!', 'success');
    return;
  }

  const element = findCardElement(target);
  if (!element) {
    showToast('That card has not loaded yet. Try again in a moment.', 'warning');
    return;
  }

  revealCard(element);
}
