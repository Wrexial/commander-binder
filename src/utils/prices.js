import { cardStore } from '../state/cardStore.js';

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function parsePrice(value) {
  const price = parseFloat(value);
  return Number.isFinite(price) ? price : null;
}

/**
 * Cheapest of the displayed printing's non-foil and foil EUR prices, or `null`
 * when it has no price. Mirrors the tooltip so a tile's badge and the tooltip
 * never disagree about which printing's price is shown.
 *
 * @param {object} card
 * @returns {number|null}
 */
export function getDisplayedPrice(card) {
  const prices = [card?.prices?.eur, card?.prices?.eur_foil]
    .map(parsePrice)
    .filter((price) => price !== null);

  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * Cheapest EUR price across every known printing of a card (non-foil or foil),
 * or `null` when nothing is priced.
 *
 * @param {object} card
 * @returns {number|null}
 */
export function getCheapestPrice(card) {
  const prices = cardStore
    .getPrintings(card.name)
    .flatMap((printing) => [printing?.prices?.eur, printing?.prices?.eur_foil])
    .map(parsePrice)
    .filter((price) => price !== null);

  return prices.length > 0 ? Math.min(...prices) : null;
}
