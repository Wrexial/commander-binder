// src/ui/components/cardLookup.js
/**
 * Shared card resolution for the bulk add/check modals. Both accept a pasted
 * list and must resolve names that aren't in the loaded `cardStore` against the
 * all-cards catalog (batched) or, before the catalog has loaded, a live
 * Scryfall lookup — so *any* card is detected, not just the legendary subset.
 */
import { cardStore, primaryName } from '../../state/cardStore.js';
import { isCardCatalogLoaded, resolveCatalogPrintingId } from '../../state/cardCatalog.js';
import { hydrateCardsByIds, loadPrintingsForNames } from '../../api/cardSearch.js';
import { parseCollection } from '../../utils/collectionFormats.js';
import { normalizeName } from './collectionModal.js';

/** One pass over the store: "set:number" (lowercase set) -> exact printing. */
export function buildPrintingIndex() {
  const byPrinting = new Map();
  for (const card of cardStore.getAll()) {
    for (const printing of cardStore.getPrintings(card.name)) {
      if (printing.set && printing.collector_number) {
        byPrinting.set(`${printing.set.toLowerCase()}:${printing.collector_number}`, printing);
      }
    }
  }
  return byPrinting;
}

/**
 * Add every card now in the store to a normalized-name -> card index, under
 * both its front-face name and its full printed name.
 */
function refreshNameIndex(nameIndex) {
  for (const card of cardStore.getAll()) {
    for (const key of new Set([normalizeName(primaryName(card)), normalizeName(card.name)])) {
      if (key && !nameIndex.has(key)) nameIndex.set(key, card);
    }
  }
}

/**
 * Resolve a parsed entry to a store card: the exact set/collector printing when
 * known, else the pasted text verbatim (so a name that genuinely starts with a
 * number still matches), else the quantity-stripped name.
 */
export function findEntryCard(entry, nameIndex, printingIndex) {
  if (printingIndex && entry.setCode && entry.collectorNumber) {
    const exact = printingIndex.get(`${entry.setCode}:${entry.collectorNumber}`);
    if (exact) return exact;
  }
  return (
    nameIndex.get(normalizeName(entry.raw ?? '')) ||
    nameIndex.get(normalizeName(entry.name)) ||
    null
  );
}

/**
 * Whether an unresolved parsed entry is a real card that just hasn't been
 * hydrated yet. Lets the add/check previews show a "loading" state instead of
 * wrongly reporting "not found" while the catalog or a live lookup is in
 * flight.
 *
 * Once the all-cards catalog is loaded the answer is authoritative: a name it
 * contains is coming, a name it doesn't is genuinely unknown. Before that, a
 * name is pending unless a live lookup has already been attempted for it.
 *
 * @param {{name?: string}} entry
 * @param {Set<string>} [attemptedNames] Names a live lookup has already run for.
 * @returns {boolean}
 */
export function isPendingName(entry, attemptedNames) {
  const name = entry?.name;
  if (!name) return false;
  if (isCardCatalogLoaded()) return Boolean(resolveCatalogPrintingId(name));
  return !attemptedNames?.has(name);
}

/**
 * Resolve pasted names that aren't already in the loaded store, fetching their
 * printings and merging them into `nameIndex` (and `printingIndex`, when given).
 *
 * @param {object} config
 * @param {string} config.text The pasted textarea value.
 * @param {Map<string, object>} config.nameIndex normalized name -> card.
 * @param {Map<string, object>} [config.printingIndex] "set:collector" -> printing.
 * @param {Set<string>} config.attemptedNames Names already live-looked-up, so a
 *   typo isn't re-fetched on every pass.
 * @returns {Promise<boolean>} whether new cards were loaded
 */
export async function resolveMissingCards({ text, nameIndex, printingIndex, attemptedNames }) {
  const { entries } = parseCollection(text);
  const ids = new Set();
  const namesToLoad = new Set();
  const catalogReady = isCardCatalogLoaded();

  for (const entry of entries) {
    const raw = normalizeName(entry.raw ?? '');
    const name = normalizeName(entry.name);
    if (nameIndex.has(raw) || nameIndex.has(name)) continue;
    if (
      printingIndex &&
      entry.setCode &&
      entry.collectorNumber &&
      printingIndex.has(`${entry.setCode}:${entry.collectorNumber}`)
    ) {
      continue;
    }

    const id = resolveCatalogPrintingId(entry.raw ?? '') || resolveCatalogPrintingId(entry.name);
    if (id) ids.add(id);
    // Until the catalog is ready it cannot tell a real name from a typo, so ask
    // Scryfall directly (once per name) instead of reporting "not found".
    else if (!catalogReady && entry.name && !attemptedNames.has(entry.name)) {
      namesToLoad.add(entry.name);
    }
  }

  if (ids.size === 0 && namesToLoad.size === 0) return false;

  const before = cardStore.getAll().length;
  if (ids.size > 0) await hydrateCardsByIds([...ids]);
  if (namesToLoad.size > 0) {
    // One batched search for every unresolved name, not one per name.
    for (const name of namesToLoad) attemptedNames.add(name);
    await loadPrintingsForNames([...namesToLoad]);
  }

  const changed = cardStore.getAll().length > before;
  if (changed) {
    refreshNameIndex(nameIndex);
    if (printingIndex) {
      for (const [key, printing] of buildPrintingIndex()) {
        if (!printingIndex.has(key)) printingIndex.set(key, printing);
      }
    }
  }
  return changed;
}
