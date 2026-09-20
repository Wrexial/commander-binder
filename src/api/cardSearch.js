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

/** Names per batched printings search (keeps the query URL short). */
const PRINTINGS_BATCH_SIZE = 10;

/** Names whose full printing list has already been fetched this session. */
const printingsLoaded = new Set();

/** Names a batched fetch already tried, so the eager pass doesn't retry them. */
const printingsAttempted = new Set();

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

/** Scryfall's exact-name term; its quoted phrase cannot contain a quote. */
function exactNameTerm(name) {
  return `!"${name.replace(/"/g, '')}"`;
}

/** A `unique=prints` search URL for a batch of exact names, oldest first. */
function batchPrintingsUrl(names) {
  const query = `(${names.map(exactNameTerm).join(' or ')})`;
  return `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
    query
  )}&unique=prints&order=released&dir=asc`;
}

/** True when a name's printing list still needs fetching (eager path only). */
function needsPrintings(name) {
  return (
    !printingsLoaded.has(name) &&
    !printingsAttempted.has(name) &&
    cardStore.getPrintings(name).length <= 1
  );
}

/**
 * Fetch and store one batch of printings.
 *
 * @param {string[]} batch
 * @returns {Promise<{added: boolean, truncated: boolean}>} `truncated` when the
 *   search still had pages left after the page cap.
 */
async function loadPrintingsBatch(batch) {
  let url = batchPrintingsUrl(batch);
  let added = false;
  for (let page = 0; page < MAX_PRINTING_PAGES && url; page++) {
    const data = await fetchPage(url);
    if (Array.isArray(data?.data)) {
      for (const card of data.data) {
        cardStore.add(card);
        added = true;
      }
    }
    url = data?.has_more ? data.next_page : null;
  }
  return { added, truncated: Boolean(url) };
}

/**
 * Fetch a batch, splitting it and re-requesting when it overflows the page cap,
 * so a very print-heavy batch can't silently drop names. Recursion ends at a
 * single name, whose own page cap is all we can do.
 *
 * @param {string[]} batch
 * @returns {Promise<boolean>} whether any printings were added
 */
async function loadPrintingsChunked(batch) {
  let added = false;
  try {
    const result = await loadPrintingsBatch(batch);
    added = result.added;

    if (result.truncated && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      const first = await loadPrintingsChunked(batch.slice(0, mid));
      const second = await loadPrintingsChunked(batch.slice(mid));
      return added || first || second;
    }

    if (result.truncated) {
      console.warn(
        `Scryfall has more printings for "${batch[0]}" than the ${MAX_PRINTING_PAGES}-page cap; showing the first pages.`
      );
    }

    for (const name of batch) printingsLoaded.add(name);
  } catch (err) {
    console.error('Failed to load printings:', err);
    // Don't retry the same batch on every render; the picker can still retry.
    for (const name of batch) printingsAttempted.add(name);
  }
  return added;
}

/**
 * Fetch the printing list for several names in as few requests as possible.
 * Scryfall has no batch printings endpoint, so the names are OR-ed into one
 * `unique=prints` search and paged through — so a binder page costs a request or
 * two instead of one `/cards/search` per pocket, which was tripping Scryfall's
 * rate limit.
 *
 * @param {Iterable<string>} names
 * @returns {Promise<boolean>} true when any printings were added
 */
export async function loadPrintingsForNames(names) {
  const pending = [...new Set([...(names || [])].map((name) => String(name || '').trim()))].filter(
    (name) => name && needsPrintings(name)
  );
  if (pending.length === 0) return false;

  let added = false;
  for (let i = 0; i < pending.length; i += PRINTINGS_BATCH_SIZE) {
    const chunk = pending.slice(i, i + PRINTINGS_BATCH_SIZE);
    added = (await loadPrintingsChunked(chunk)) || added;
  }
  return added;
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
  printingsAttempted.clear();
}
