// src/state/cardStore.js

const cardsByName = new Map();
const printingIdsByName = new Map();

/**
 * Cards are grouped by their front-face name, so a double-faced card
 * ("Front // Back") is found under "Front".
 * @param {string|object} cardOrName
 * @returns {string}
 */
export function primaryName(cardOrName) {
  const name = typeof cardOrName === 'string' ? cardOrName : cardOrName?.name;
  return (name || '').split(' // ')[0];
}

function releaseKey(card) {
  return card.released_at || '';
}

export const cardStore = {
  add(card) {
    if (!card || !card.name) return;

    const name = primaryName(card);

    let printings = cardsByName.get(name);
    if (!printings) {
      printings = [];
      cardsByName.set(name, printings);
      printingIdsByName.set(name, new Set());
    }

    // O(1) dedupe instead of scanning the printings array.
    const seenIds = printingIdsByName.get(name);
    if (seenIds.has(card.id)) return;
    seenIds.add(card.id);

    // Keep printings ordered by release date. `released_at` is an ISO
    // YYYY-MM-DD string, so a string comparison is equivalent to a date
    // comparison while avoiding a Date allocation per comparison. Binary
    // insert keeps reads (which are very hot) returning a sorted array
    // without re-sorting on every add.
    const key = releaseKey(card);
    let low = 0;
    let high = printings.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (releaseKey(printings[mid]) <= key) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    printings.splice(low, 0, card);
  },

  getPrintings(cardOrName) {
    return cardsByName.get(primaryName(cardOrName)) || [];
  },

  getOldestPrinting(name) {
    const printings = this.getPrintings(name);
    return printings.length > 0 ? printings[0] : undefined;
  },

  /**
   * Position of a printing among all known printings of the same card name:
   * a 1-based release-ordered index (1 = base printing) plus the total. Shared
   * by the tile badge and the tooltip so they can never disagree about
   * "version X of Y".
   * @param {object} card
   * @returns {{ index: number, total: number }}
   */
  getPrintingPosition(card) {
    const name = primaryName(card);
    if (!name) return { index: 0, total: 0 };

    const printings = cardsByName.get(name) || [];
    const position = printings.findIndex((printing) => printing.id === card.id);
    return { index: position >= 0 ? position + 1 : 1, total: printings.length };
  },

  getAll() {
    return Array.from(cardsByName.values()).map((printings) => printings[0]);
  },

  clear() {
    cardsByName.clear();
    printingIdsByName.clear();
  },
};
