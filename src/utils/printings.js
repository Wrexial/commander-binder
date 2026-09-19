import { getDisplayedPrice } from './priceFields.js';

/** ISO release date, used as the stable tie-break for equal prices. */
function releaseKey(card) {
  return card?.released_at || '';
}

/**
 * Printings ordered cheapest-first in the selected currency, so the version
 * badge's "1" is always the cheapest version and cycling walks from cheapest to
 * most expensive. Missing prices sort last and release date (oldest first)
 * breaks ties, so a card with no price data keeps its release order.
 *
 * @param {object[]} printings
 * @returns {object[]} a new, sorted array
 */
export function orderPrintingsByPrice(printings) {
  return [...(printings || [])].sort((a, b) => {
    const priceA = getDisplayedPrice(a);
    const priceB = getDisplayedPrice(b);
    if (priceA === priceB) return releaseKey(a).localeCompare(releaseKey(b));
    if (priceA == null) return 1;
    if (priceB == null) return -1;
    return priceA - priceB;
  });
}

/** The cheapest printing, or `null` when the list is empty. */
export function cheapestPrinting(printings) {
  return orderPrintingsByPrice(printings)[0] ?? null;
}

/**
 * The next (or previous) printing to show when cycling a tile, statistics row or
 * the modal preview, wrapping around. Returns `null` when the card has no other
 * printing.
 *
 * @param {object[]} printings Price-ordered printings of the card (see
 *   {@link orderPrintingsByPrice}).
 * @param {object} card The printing currently displayed.
 * @param {number} [direction] +1 for the next printing, -1 for the previous.
 * @returns {object|null}
 */
export function nextPrinting(printings, card, direction = 1) {
  if (!Array.isArray(printings) || printings.length <= 1 || !card) return null;

  const index = printings.findIndex((printing) => printing.id === card.id);
  if (index === -1) return printings[0];

  const step = direction < 0 ? -1 : 1;
  return printings[(index + step + printings.length) % printings.length];
}
