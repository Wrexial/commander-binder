/**
 * A lightweight index of *every* card name, built for free while the Scryfall
 * `default_cards` bulk file is streamed for the legendary-creature subset (see
 * `api/bulkData.js`). It holds no full card data, so it stays small:
 *
 *  - `names`      — the sorted, unique front-face names, for instant all-cards
 *                   search in the Binder Builder picker (no per-keystroke API).
 *  - `nameById`   — printing id → front-face name, so the compare/statistics
 *                   tools can label a collection id that isn't in `cardStore`
 *                   (e.g. a non-legendary card added to a binder) instead of
 *                   showing a raw Scryfall UUID.
 *
 * The catalog is populated as a side effect of loading the bulk set, so it is
 * available on both pages without any extra download.
 */

/** @type {string[]} */
let names = [];
/** @type {Map<string, string>} */
let nameById = new Map();
let loaded = false;

/** True once a bulk stream has published the catalog (even if empty). */
export function isCardCatalogLoaded() {
  return loaded;
}

/** Publish (or replace) the catalog from a bulk subset record. */
export function setCardCatalog({ cardNames, cardNameById } = {}) {
  names = Array.isArray(cardNames) ? cardNames : [];
  nameById = new Map(Object.entries(cardNameById || {}));
  loaded = names.length > 0 || nameById.size > 0;
}

/** The front-face name for a printing id, or null when unknown. */
export function resolveCatalogName(id) {
  return nameById.get(id) || null;
}

/** Every known name (used by tests/diagnostics). */
export function getCatalogNames() {
  return names;
}

/**
 * Rank all-cards name matches: prefix first, then word-start, then substring.
 * Mirrors `rankCardNames` in the picker so local and API results look alike.
 *
 * @param {string} query
 * @param {number} [limit]
 * @returns {string[]}
 */
export function rankCatalogNames(query, limit = 30) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (q.length < 2 || names.length === 0) return [];

  const startsWith = [];
  const wordStart = [];
  const contains = [];

  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) startsWith.push(name);
    else if (lower.split(/[\s,]+/).some((word) => word.startsWith(q))) wordStart.push(name);
    else if (lower.includes(q)) contains.push(name);
  }

  return [...startsWith, ...wordStart, ...contains].slice(0, limit);
}

/** Drop the catalog (tests). */
export function resetCardCatalog() {
  names = [];
  nameById = new Map();
  loaded = false;
}
