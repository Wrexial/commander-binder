import { cardStore } from '../state/cardStore.js';
import { getCurrency, getDisplayedPrice } from './priceFields.js';

/**
 * Price helpers that need the card store. The currency-aware reading and
 * formatting lives in `priceFields.js` (imported by `cardStore.js` too); this
 * module re-exports it so callers keep importing from `prices.js`.
 */
export {
  CURRENCY_OPTIONS,
  getCurrency,
  getCurrencySymbol,
  getDisplayedPrice,
  formatPrice,
  formatPriceRange,
} from './priceFields.js';

/**
 * Cheapest price across every known printing of a card in the selected
 * currency, or `null` when nothing is priced.
 *
 * @param {object} card
 * @param {string} [currency] Override the setting (used by tests).
 * @returns {number|null}
 */
export function getCheapestPrice(card, currency = getCurrency()) {
  const prices = cardStore
    .getPrintings(card.name)
    .map((printing) => getDisplayedPrice(printing, currency))
    .filter((price) => price !== null);

  return prices.length > 0 ? Math.min(...prices) : null;
}
