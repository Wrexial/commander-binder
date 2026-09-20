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
 *  - `idByName`   — front-face name → one printing id, so the bulk add/check
 *                   modals can resolve *any* named card in a batched request
 *                   instead of one search per name.
 *
 * The catalog is populated as a side effect of loading the bulk set, so it is
 * available on both pages without any extra download.
 */

/** @type {string[]} */
let names = [];
/** Lowercased parallel array, rebuilt with `names` so ranking never re-lowercases. */
let lowerNames = [];
/** @type {Map<string, string>} */
let nameById = new Map();
/** @type {Map<string, string>} lowercased front name -> one printing id */
let idByName = new Map();
/** @type {Map<string, string[]>} lowercased front name -> every printing id */
let printingIdsByName = new Map();
let loaded = false;

/** True once a bulk stream has published the catalog (even if empty). */
export function isCardCatalogLoaded() {
  return loaded;
}

/** Invert the id -> name map so a name can list all of its printings. */
function indexPrintingsByName(nameById) {
  const byName = new Map();
  for (const [id, name] of nameById) {
    const key = frontName(name);
    if (!key) continue;
    const ids = byName.get(key);
    if (ids) ids.push(id);
    else byName.set(key, [id]);
  }
  return byName;
}

/** Publish (or replace) the catalog from a bulk subset record. */
export function setCardCatalog({ cardNames, cardNameById, cardIdByName } = {}) {
  names = Array.isArray(cardNames) ? cardNames : [];
  lowerNames = names.map((name) => name.toLowerCase());
  nameById = new Map(Object.entries(cardNameById || {}));
  idByName = new Map(Object.entries(cardIdByName || {}));
  printingIdsByName = indexPrintingsByName(nameById);

  // Subsets cached before `cardIdByName` existed only carry `nameById`; invert
  // it so name resolution still works without re-downloading the bulk file.
  if (idByName.size === 0 && nameById.size > 0) {
    for (const [id, name] of nameById) {
      const key = frontName(name);
      if (!idByName.has(key)) idByName.set(key, id);
    }
  }

  loaded = names.length > 0 || nameById.size > 0 || idByName.size > 0;
}

/** The front-face name, matching how the catalog keys multi-face cards. */
function frontName(value) {
  return String(value || '')
    .split(' // ')[0]
    .trim()
    .toLowerCase();
}

/** One printing id for a (case-insensitive) card name, or null when unknown. */
export function resolveCatalogPrintingId(name) {
  return idByName.get(frontName(name)) || null;
}

/**
 * Every known printing id for a (case-insensitive) card name, or null when the
 * name isn't in the catalog. Lets the Binder Builder load a card's full
 * printing list from the local archive instead of a Scryfall search.
 *
 * @param {string} name
 * @returns {string[]|null}
 */
export function getCatalogPrintingIds(name) {
  const ids = printingIdsByName.get(frontName(name));
  return ids ? ids.slice() : null;
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

  // Cached subsets are published wholesale, but guard against a stale parallel
  // array (e.g. tests that swap `names` directly).
  if (lowerNames.length !== names.length) {
    lowerNames = names.map((name) => name.toLowerCase());
  }

  const startsWith = [];
  const wordStart = [];
  const contains = [];

  for (let i = 0; i < names.length; i++) {
    const lower = lowerNames[i];
    if (lower.startsWith(q)) startsWith.push(names[i]);
    else if (lower.split(/[\s,]+/).some((word) => word.startsWith(q))) wordStart.push(names[i]);
    else if (lower.includes(q)) contains.push(names[i]);
  }

  return [...startsWith, ...wordStart, ...contains].slice(0, limit);
}

/** Drop the catalog (tests). */
export function resetCardCatalog() {
  names = [];
  lowerNames = [];
  nameById = new Map();
  idByName = new Map();
  printingIdsByName = new Map();
  loaded = false;
}
