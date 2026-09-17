// src/utils/sortCards.js
/**
 * Sorting for the card grid. The default (`release-asc`, oldest first) is the
 * only order the grid can stream in; every other order is applied by rebuilding
 * the grid once the collection is loaded (see `cardFeed.js`).
 */
import { isCardOwned } from '../state/cardState.js';
import { getDisplayedPrice } from './prices.js';

export const DEFAULT_SORT = 'release-asc';

export const SORT_OPTIONS = [
  { id: 'release-asc', label: 'Oldest first' },
  { id: 'release-desc', label: 'Newest first' },
  { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'cmc-asc', label: 'Mana value: low to high' },
  { id: 'cmc-desc', label: 'Mana value: high to low' },
  { id: 'rarity-asc', label: 'Rarity: rarest first' },
  { id: 'rarity-desc', label: 'Rarity: commonest first' },
  { id: 'owned-asc', label: 'Owned first' },
  { id: 'owned-desc', label: 'Missing first' },
];

const SORT_IDS = new Set(SORT_OPTIONS.map((option) => option.id));

const RARITY_ORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3, special: 4, bonus: 5 };
const RARITY_LABELS = {
  mythic: 'Mythic',
  rare: 'Rare',
  uncommon: 'Uncommon',
  common: 'Common',
  special: 'Special',
  bonus: 'Bonus',
};

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
    case 'rarity':
      return (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99);
    case 'owned':
      return Number(isCardOwned(b)) - Number(isCardOwned(a));
    case 'release':
    default:
      return (a.released_at || '').localeCompare(b.released_at || '');
  }
}

/** Stable order among equal primary keys (the direction must not flip this). */
function tiebreakCompare(key, a, b) {
  if (key === 'owned') {
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
      return price == null ? '—' : `€${price.toFixed(2)}`;
    }
    case 'cmc':
      return card.cmc == null ? '—' : String(card.cmc);
    case 'rarity':
      return RARITY_LABELS[card.rarity] || card.rarity || '—';
    case 'owned':
      return isCardOwned(card) ? 'Owned' : 'Missing';
    case 'release':
    default:
      return card.released_at ? String(new Date(card.released_at).getFullYear()) : '—';
  }
}
