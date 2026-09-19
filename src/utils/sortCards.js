// src/utils/sortCards.js
/**
 * Sorting for the card grid. The default (`release-asc`, oldest first) is the
 * only order the grid can stream in; every other order is applied by rebuilding
 * the grid once the collection is loaded (see `cardFeed.js`).
 */
import { isCardOwned } from '../state/cardState.js';
import { isCardWanted } from '../state/wishlistState.js';
import { getDisplayedPrice, formatPrice } from './prices.js';

export const DEFAULT_SORT = 'release-asc';

export const SORT_OPTIONS = [
  { id: 'release-asc', label: 'Oldest first' },
  { id: 'release-desc', label: 'Newest first' },
  { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' },
  { id: 'color-asc', label: 'Colour' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'cmc-asc', label: 'Mana value: low to high' },
  { id: 'cmc-desc', label: 'Mana value: high to low' },
  { id: 'rarity-asc', label: 'Rarity: rarest first' },
  { id: 'rarity-desc', label: 'Rarity: commonest first' },
  { id: 'owned-asc', label: 'Owned first' },
  { id: 'owned-desc', label: 'Missing first' },
  { id: 'wanted-asc', label: 'Wanted first' },
  { id: 'wanted-desc', label: 'Not wanted first' },
];

const SORT_IDS = new Set(SORT_OPTIONS.map((option) => option.id));

const RARITY_ORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
const RARITY_LABELS = {
  mythic: 'Mythic',
  rare: 'Rare',
  uncommon: 'Uncommon',
  common: 'Common',
};

/** WUBRG order, used to rank a card's colour identity. */
const COLOR_INDEX = { W: 0, U: 1, B: 2, R: 3, G: 4 };
/** Single-digit codes so a colour identity string sorts in WUBRG order. */
const COLOR_DIGITS = { W: '1', U: '2', B: '3', R: '4', G: '5' };

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

/**
 * Guild / shard / wedge / four-colour names, keyed by the WUBRG-sorted identity
 * ("WU" = Azorius, "WUG" = Bant, "WBRG" = Dune, …).
 */
const COLOR_COMBO_NAMES = {
  // Guilds (two colours)
  WU: 'Azorius',
  WB: 'Orzhov',
  WR: 'Boros',
  WG: 'Selesnya',
  UB: 'Dimir',
  UR: 'Izzet',
  UG: 'Simic',
  BR: 'Rakdos',
  BG: 'Golgari',
  RG: 'Gruul',
  // Shards and wedges (three colours)
  WUG: 'Bant',
  WUB: 'Esper',
  UBR: 'Grixis',
  BRG: 'Jund',
  WRG: 'Naya',
  WBG: 'Abzan',
  WUR: 'Jeskai',
  WBR: 'Mardu',
  UBG: 'Sultai',
  URG: 'Temur',
  // Four colours
  WBRG: 'Dune',
  UBRG: 'Glint',
  WURG: 'Ink',
  WUBG: 'Witch',
  WUBR: 'Yore',
  // All five
  WUBRG: 'WUBRG',
};

/** Identity letters in canonical WUBRG order. */
function wubrg(identity) {
  return [...identity].sort((a, b) => (COLOR_INDEX[a] ?? 9) - (COLOR_INDEX[b] ?? 9));
}

/** Groups: mono + colourless first, then two, three, four and five colours. */
function colorRank(card) {
  const count = (card.color_identity || []).length;
  return count <= 1 ? 1 : count;
}

/** Within a group, sort by the WUBRG identity (colourless last in its group). */
function colorKey(card) {
  const identity = card.color_identity || [];
  if (identity.length === 0) return '9';
  return identity
    .map((color) => COLOR_DIGITS[color] || '8')
    .sort()
    .join('');
}

/** Human name for a card's colour identity, for the scrubber mark. */
function colorLabel(card) {
  const identity = wubrg(card.color_identity || []);
  if (identity.length === 0) return 'Colourless';
  const key = identity.join('');
  if (identity.length === 1) return COLOR_NAMES[key] || key;
  return COLOR_COMBO_NAMES[key] || key;
}

/** True only for the streamable, chronological default order. */
export function isDefaultSort(sortId) {
  return sortId === DEFAULT_SORT;
}

function parseSort(sortId) {
  const id = SORT_IDS.has(sortId) ? sortId : DEFAULT_SORT;
  return {
    key: id.replace(/-(asc|desc)$/, ''),
    direction: id.endsWith('-desc') ? -1 : 1,
  };
}

function priceOf(card) {
  const price = getDisplayedPrice(card);
  return price == null ? Number.POSITIVE_INFINITY : price;
}

function primaryCompare(key, a, b) {
  switch (key) {
    case 'name':
      return (a.name || '').localeCompare(b.name || '');
    case 'price':
      return priceOf(a) - priceOf(b);
    case 'cmc':
      return (a.cmc ?? 0) - (b.cmc ?? 0);
    case 'color':
      return colorRank(a) - colorRank(b) || colorKey(a).localeCompare(colorKey(b));
    case 'rarity':
      return (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99);
    case 'owned':
      return Number(isCardOwned(b)) - Number(isCardOwned(a));
    case 'wanted':
      return Number(isCardWanted(b)) - Number(isCardWanted(a));
    case 'release':
    default:
      return (a.released_at || '').localeCompare(b.released_at || '');
  }
}

/** Stable order among equal primary keys (the direction must not flip this). */
function tiebreakCompare(key, a, b) {
  if (key === 'owned' || key === 'wanted') {
    return (
      (a.released_at || '').localeCompare(b.released_at || '') ||
      (a.name || '').localeCompare(b.name || '')
    );
  }
  return (a.name || '').localeCompare(b.name || '');
}

/**
 * Return a sorted copy of `cards` for the given sort option id. Unknown ids fall
 * back to the default (oldest first). Equal keys keep their input order.
 *
 * @param {object[]} cards
 * @param {string} sortId
 * @returns {object[]}
 */
export function sortCards(cards, sortId) {
  const { key, direction } = parseSort(sortId);

  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const primary = primaryCompare(key, a.card, b.card) * direction;
      if (primary !== 0) return primary;
      return tiebreakCompare(key, a.card, b.card) || a.index - b.index;
    })
    .map((entry) => entry.card);
}

/**
 * Short label for the scrubber mark at the start of a page: the sort value of
 * its first card (year, letter, price, …).
 *
 * @param {object} card
 * @param {string} sortId
 * @returns {string}
 */
export function sortMark(card, sortId) {
  const { key } = parseSort(sortId);

  switch (key) {
    case 'name': {
      const first = (card.name || '').trim().charAt(0).toUpperCase();
      return /[A-Z]/.test(first) ? first : '#';
    }
    case 'price': {
      const price = getDisplayedPrice(card);
      return price == null ? '—' : formatPrice(price);
    }
    case 'cmc':
      return card.cmc == null ? '—' : String(card.cmc);
    case 'rarity':
      return RARITY_LABELS[card.rarity] || '—';
    case 'color':
      return colorLabel(card);
    case 'owned':
      return isCardOwned(card) ? 'Owned' : 'Missing';
    case 'wanted':
      return isCardWanted(card) ? 'Wanted' : 'Not wanted';
    case 'release':
    default:
      return card.released_at ? String(new Date(card.released_at).getFullYear()) : '—';
  }
}
