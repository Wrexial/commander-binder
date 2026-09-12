// src/state/cardStore.js

const cardsByName = new Map();
const printingIdsByName = new Map();

function releaseKey(card) {
  return card.released_at || "";
}

export const cardStore = {
  add(card) {
    if (!card || !card.name) return;

    const primaryName = card.name.split(" // ")[0];

    let printings = cardsByName.get(primaryName);
    if (!printings) {
      printings = [];
      cardsByName.set(primaryName, printings);
      printingIdsByName.set(primaryName, new Set());
    }

    // O(1) dedupe instead of scanning the printings array.
    const seenIds = printingIdsByName.get(primaryName);
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

  getPrintings(name) {
    const primaryName = name.split(" // ")[0];
    return cardsByName.get(primaryName) || [];
  },

  getOldestPrinting(name) {
    const printings = this.getPrintings(name);
    return printings.length > 0 ? printings[0] : undefined;
  },

  getAll() {
    return Array.from(cardsByName.values()).map((printings) => printings[0]);
  },

  clear() {
    cardsByName.clear();
    printingIdsByName.clear();
  },
};
