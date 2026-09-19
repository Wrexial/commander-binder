// src/state/filters.js
/**
 * The filter bar's state, kept separate from the free-text search query. The
 * two are combined in `src/ui/search.js`: a card is shown only when it matches
 * the parsed query *and* this predicate.
 *
 * All values are plain data so the whole state can be persisted to
 * `sessionStorage` via `viewState.js`.
 */
import { isCardOwned } from './cardState.js';
import { isCardWanted } from './wishlistState.js';
import { getDisplayedPrice } from '../utils/prices.js';

export const COLOR_OPTIONS = [
  { id: 'W', label: 'White' },
  { id: 'U', label: 'Blue' },
  { id: 'B', label: 'Black' },
  { id: 'R', label: 'Red' },
  { id: 'G', label: 'Green' },
  { id: 'C', label: 'Colourless' },
];

export const RARITY_OPTIONS = [
  { id: 'mythic', label: 'Mythic' },
  { id: 'rare', label: 'Rare' },
  { id: 'uncommon', label: 'Uncommon' },
  { id: 'common', label: 'Common' },
  { id: 'special', label: 'Special' },
  { id: 'bonus', label: 'Bonus' },
];

export const OWNED_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'owned', label: 'Owned' },
  { id: 'missing', label: 'Missing' },
];

/** The wishlist filter group — independent of the owned/missing one. */
export const WANTED_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'wanted', label: 'Wanted' },
  { id: 'unwanted', label: 'Not wanted' },
];

/**
 * How the selected colour pips are combined.
 *  - `exclusive` (default) the card's identity uses only the selected colours
 *                (e.g. selecting WB matches W, B and WB)
 *  - `exact`     the card's identity is exactly the selected colours
 */
export const COLOR_MODE_OPTIONS = [
  {
    id: 'exclusive',
    label: 'Exclusive',
    title: 'Only the selected colours — WB shows W, B and WB cards',
  },
  {
    id: 'exact',
    label: 'Exact',
    title: 'Exactly the selected colours — WB shows only WB cards',
  },
];

export const DEFAULT_FILTERS = {
  owned: 'all', // 'all' | 'owned' | 'missing'
  wanted: 'all', // 'all' | 'wanted' | 'unwanted'
  colors: [], // subset of COLOR_OPTIONS ids; [] = any
  colorMode: 'exclusive', // one of COLOR_MODE_OPTIONS ids
  rarities: [], // subset of RARITY_OPTIONS ids; [] = any
  set: '', // lowercase set code; '' = any
  priceMin: null,
  priceMax: null,
  sort: 'release-asc', // see utils/sortCards.js; default = oldest first
};

const COLOR_IDS = new Set(COLOR_OPTIONS.map((option) => option.id));
const RARITY_IDS = new Set(RARITY_OPTIONS.map((option) => option.id));
const OWNED_IDS = new Set(OWNED_OPTIONS.map((option) => option.id));
const WANTED_IDS = new Set(WANTED_OPTIONS.map((option) => option.id));
const COLOR_MODES = new Set(COLOR_MODE_OPTIONS.map((option) => option.id));

function cloneFilters(source) {
  return {
    ...source,
    colors: [...(source.colors || [])],
    rarities: [...(source.rarities || [])],
  };
}

/** Live filter state consumed by the predicate below and the filter bar UI. */
export const filters = cloneFilters(DEFAULT_FILTERS);

function toPrice(value) {
  // `null`/`''` mean "no bound"; without this guard Number(null) === 0 and a
  // restored filter would silently become a 0–0 range that hides everything.
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Coerce persisted/serialized data into valid filters (drops unknown values). */
export function normalizeFilters(raw) {
  const next = cloneFilters(DEFAULT_FILTERS);
  if (!raw || typeof raw !== 'object') return next;

  if (OWNED_IDS.has(raw.owned)) next.owned = raw.owned;
  if (WANTED_IDS.has(raw.wanted)) next.wanted = raw.wanted;
  if (COLOR_MODES.has(raw.colorMode)) {
    next.colorMode = raw.colorMode;
  }
  if (Array.isArray(raw.colors)) {
    next.colors = [...new Set(raw.colors)].filter((color) => COLOR_IDS.has(color));
  }
  if (Array.isArray(raw.rarities)) {
    next.rarities = [...new Set(raw.rarities)].filter((rarity) => RARITY_IDS.has(rarity));
  }
  if (typeof raw.set === 'string') next.set = raw.set.toLowerCase();
  if (typeof raw.sort === 'string') next.sort = raw.sort;
  next.priceMin = toPrice(raw.priceMin);
  next.priceMax = toPrice(raw.priceMax);

  return next;
}

/** Replace the live state in place (the exported object identity is stable). */
export function applyFilters(next) {
  Object.assign(filters, cloneFilters(next));
}

export function resetFilters() {
  applyFilters(DEFAULT_FILTERS);
}

/** Number of active filter groups, for the toggle badge. */
export function activeFilterCount() {
  let count = 0;
  if (filters.owned !== 'all') count++;
  if (filters.wanted !== 'all') count++;
  if (filters.colors.length > 0) count++;
  if (filters.rarities.length > 0) count++;
  if (filters.set) count++;
  if (filters.priceMin != null || filters.priceMax != null) count++;
  return count;
}

function matchesColors(card) {
  const identity = new Set(card.color_identity || []);
  const wantsColorless = filters.colors.includes('C');
  const wanted = filters.colors.filter((color) => color !== 'C');
  const isColorless = identity.size === 0;

  if (filters.colorMode === 'exact') {
    // The identity must be exactly the selected colours (colourless = empty).
    if (wantsColorless) return isColorless && wanted.length === 0;
    return identity.size === wanted.length && wanted.every((color) => identity.has(color));
  }

  // Exclusive (default): only the selected colours may appear, so selecting
  // WB matches W, B and WB. Colourless joins only when its pip is selected.
  if (isColorless) return wantsColorless;
  return [...identity].every((color) => wanted.includes(color));
}

/**
 * True when a card passes every active filter. Independent of the search query.
 *
 * @param {object} card Scryfall card object (the printing shown on the tile).
 * @returns {boolean}
 */
export function cardMatchesFilters(card) {
  if (!card) return true;

  if (filters.owned === 'owned' && !isCardOwned(card)) return false;
  if (filters.owned === 'missing' && isCardOwned(card)) return false;

  if (filters.wanted === 'wanted' && !isCardWanted(card)) return false;
  if (filters.wanted === 'unwanted' && isCardWanted(card)) return false;

  if (filters.colors.length > 0 && !matchesColors(card)) return false;
  if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) return false;
  if (filters.set && (card.set || '').toLowerCase() !== filters.set) return false;

  if (filters.priceMin != null || filters.priceMax != null) {
    const price = getDisplayedPrice(card);
    if (price == null) return false;
    if (filters.priceMin != null && price < filters.priceMin) return false;
    if (filters.priceMax != null && price > filters.priceMax) return false;
  }

  return true;
}
