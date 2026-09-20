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

/** The oldest printing (earliest release date), or `null` when empty. */
export function oldestPrinting(printings) {
  return (printings || []).reduce(
    (oldest, card) => (!oldest || releaseKey(card) < releaseKey(oldest) ? card : oldest),
    null
  );
}

/** The most expensive priced printing in the selected currency, or `null`. */
export function mostExpensivePrinting(printings) {
  let best = null;
  let bestPrice = null;
  for (const card of printings || []) {
    const price = getDisplayedPrice(card);
    if (price == null) continue;
    if (bestPrice == null || price > bestPrice) {
      best = card;
      bestPrice = price;
    }
  }
  return best;
}

/**
 * True when a printing is a premium "full art" treatment. Scryfall's `full_art`
 * flag is very narrow (most showcase and borderless cards are `false`), so the
 * borderless border and the showcase / extended-art frames count too — that is
 * the "fancy version" a collector means by full art.
 */
function isFullArt(card) {
  if (!card) return false;
  if (card.full_art === true) return true;
  if (card.border_color === 'borderless') return true;
  const effects = card.frame_effects || [];
  return effects.includes('showcase') || effects.includes('extendedart');
}

/** The cheapest full-art (incl. borderless / showcase) printing, or `null`. */
export function fullArtPrinting(printings) {
  return cheapestPrinting((printings || []).filter(isFullArt));
}

/**
 * Pick the printing a "default printing" mode shows. A mode with no match (no
 * price data, no full-art version) falls back to the oldest printing so the
 * tile always shows something sensible.
 *
 * @param {object[]} printings
 * @param {'oldest'|'cheapest'|'most-expensive'|'full-art'} mode
 * @returns {object|null}
 */
export function selectPrinting(printings, mode) {
  const list = printings || [];
  if (mode === 'cheapest') return cheapestPrinting(list) ?? oldestPrinting(list);
  if (mode === 'most-expensive') return mostExpensivePrinting(list) ?? oldestPrinting(list);
  if (mode === 'full-art') return fullArtPrinting(list) ?? oldestPrinting(list);
  return oldestPrinting(list);
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
