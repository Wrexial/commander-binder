/**
 * On-demand card lookup for the Binder Builder. The browse view keeps the
 * whole legendary-creature set in `cardStore` (from Scryfall bulk data), but a
 * binder can hold *any* card, so the builder searches Scryfall live instead of
 * downloading every printing.
 *
 * Everything here funnels through `scryfall.js`, so autocomplete and printing
 * lookups share the same response cache and rate limiting as the grid. Results
 * are added to `cardStore`, which makes the rest of the app (tiles, ownership,
 * printing cycling, statistics) work against them unchanged.
 */
import { MAX_COLLECTION_IDENTIFIERS, fetchCardsByIds, fetchPage } from './scryfall.js';
import { cardStore } from '../state/cardStore.js';

const AUTOCOMPLETE_URL = (query) =>
  `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`;

/** Exact-name search, every printing, oldest first (matches the browse order). */
const PRINTINGS_URL = (name) =>
  `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
    `!"${name}"`
  )}&unique=prints&order=released&dir=asc`;

/** How many search pages of printings to follow (175 cards each). */
const MAX_PRINTING_PAGES = 3;

/** Names whose full printing list has already been fetched this session. */
const printingsLoaded = new Set();

/** Scryfall's autocomplete catalog for a partial name (min 2 characters). */
export async function autocompleteCardNames(query) {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) return [];

  const data = await fetchPage(AUTOCOMPLETE_URL(trimmed));
  const names = Array.isArray(data?.data) ? data.data : [];
  return names.filter((name) => typeof name === 'string' && name);
}

/**
 * Fetch every printing of a card name and add them to `cardStore`.
 * @param {string} name
 * @returns {Promise<object[]>} the loaded printings
 */
export async function loadPrintingsForName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return [];

  const cards = [];
  let url = PRINTINGS_URL(trimmed);
  for (let page = 0; page < MAX_PRINTING_PAGES && url; page++) {
    const data = await fetchPage(url);
    if (Array.isArray(data?.data)) cards.push(...data.data);
    url = data?.has_more ? data.next_page : null;
  }

  for (const card of cards) cardStore.add(card);
  if (cards.length > 0) printingsLoaded.add(trimmed);
  return cards;
}

/**
 * Make sure a name's printings are loaded (so the version badge and cycling
 * work), fetching them once if needed. Best-effort: failures are logged.
 */
export async function ensurePrintingsLoaded(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || printingsLoaded.has(trimmed)) return;

  // More than one printing already in the store means the list is complete
  // enough; a single-printing card is remembered so it is not re-fetched.
  if (cardStore.getPrintings(trimmed).length > 1) {
    printingsLoaded.add(trimmed);
    return;
  }

  try {
    await loadPrintingsForName(trimmed);
  } catch (err) {
    console.error('Failed to load printings:', err);
  }
}

/**
 * Fetch specific printings by id (batched) and add them to `cardStore`.
 * @param {string[]} ids
 * @returns {Promise<object[]>} the freshly loaded cards
 */
export async function hydrateCardsByIds(ids) {
  const unique = [...new Set((ids || []).filter((id) => typeof id === 'string' && id))];
  const missing = unique.filter((id) => !cardStore.getByPrintingId(id));

  const added = [];
  for (let i = 0; i < missing.length; i += MAX_COLLECTION_IDENTIFIERS) {
    try {
      const cards = await fetchCardsByIds(missing.slice(i, i + MAX_COLLECTION_IDENTIFIERS));
      for (const card of cards) {
        if (card && card.id) {
          cardStore.add(card);
          added.push(card);
        }
      }
    } catch (err) {
      console.error('Failed to hydrate cards:', err);
    }
  }
  return added;
}

/** Forget which printing lists have been fetched (tests). */
export function resetCardSearchCache() {
  printingsLoaded.clear();
}
