import { cardStore } from '../state/cardStore.js';
import { cardSettings } from '../state/cardSettings.js';

/**
 * The price sources Scryfall ships on every card object. EUR comes from
 * Cardmarket, USD from TCGplayer and TIX from MTGO; the app never fetches a
 * separate price feed, it just reads the matching `prices` field(s) below.
 */
export const CURRENCY_OPTIONS = [
  { id: 'eur', label: 'EUR (€)', symbol: '€' },
  { id: 'usd', label: 'USD ($)', symbol: '$' },
  { id: 'tix', label: 'MTGO TIX', symbol: 'TIX' },
];

/**
 * Per-currency Scryfall fields and display rules. EUR/USD have separate foil
 * fields and print with a leading symbol ("€1.50"); TIX has a single field and
 * reads better with a trailing unit ("1.50 TIX").
 */
const CURRENCIES = {
  eur: { symbol: '€', fields: ['eur', 'eur_foil'], suffix: false },
  usd: { symbol: '$', fields: ['usd', 'usd_foil'], suffix: false },
  tix: { symbol: 'TIX', fields: ['tix'], suffix: true },
};

const DEFAULT_CURRENCY = 'eur';

function currencyConfig(currency) {
  return CURRENCIES[currency] || CURRENCIES[DEFAULT_CURRENCY];
}

/** The currency selected in settings, falling back to EUR for stale values. */
export function getCurrency() {
  const value = cardSettings?.currency;
  return CURRENCIES[value] ? value : DEFAULT_CURRENCY;
}

/** The display symbol for a currency (defaults to the selected one). */
export function getCurrencySymbol(currency = getCurrency()) {
  return currencyConfig(currency).symbol;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function parsePrice(value) {
  const price = parseFloat(value);
  return Number.isFinite(price) ? price : null;
}

/** Parse the currency's price fields off one card, dropping missing values. */
function cardPrices(card, currency) {
  return currencyConfig(currency)
    .fields.map((field) => parsePrice(card?.prices?.[field]))
    .filter((price) => price !== null);
}

/**
 * Cheapest of the displayed printing's prices in the selected currency, or
 * `null` when it has none. Mirrors the tooltip so a tile's badge and the
 * tooltip never disagree about which printing's price is shown.
 *
 * @param {object} card
 * @param {string} [currency] Override the setting (used by tests).
 * @returns {number|null}
 */
export function getDisplayedPrice(card, currency = getCurrency()) {
  const prices = cardPrices(card, currency);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * Cheapest price across every known printing of a card in the selected
 * currency, or `null` when nothing is priced.
 *
 * @param {object} card
 * @param {string} [currency] Override the setting (used by tests).
 * @returns {number|null}
 */
export function getCheapestPrice(card, currency = getCurrency()) {
  const fields = currencyConfig(currency).fields;
  const prices = cardStore
    .getPrintings(card.name)
    .flatMap((printing) => fields.map((field) => parsePrice(printing?.prices?.[field])))
    .filter((price) => price !== null);

  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * Format a price in the selected currency. Returns '—' for missing/invalid
 * values. `decimals` lets callers print whole-number thresholds.
 *
 * @param {number} value
 * @param {{currency?: string, decimals?: number}} [options]
 * @returns {string}
 */
export function formatPrice(value, { currency = getCurrency(), decimals = 2 } = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';

  const config = currencyConfig(currency);
  const text = number.toFixed(decimals);
  return config.suffix ? `${text} ${config.symbol}` : `${config.symbol}${text}`;
}

/**
 * Format a price threshold range for the statistics buckets, e.g. "€1–5" or
 * "50+ TIX". A `null` max means "and up".
 *
 * @param {number} min
 * @param {number|null} max
 * @param {string} [currency]
 * @returns {string}
 */
export function formatPriceRange(min, max, currency = getCurrency()) {
  const config = currencyConfig(currency);
  if (max == null) {
    return config.suffix ? `${min}+ ${config.symbol}` : `${config.symbol}${min}+`;
  }
  return config.suffix ? `${min}–${max} ${config.symbol}` : `${config.symbol}${min}–${max}`;
}
