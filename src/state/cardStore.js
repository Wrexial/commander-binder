// src/loadedCards.js

const cardsByName = new Map();

export const cardStore = {
  add(card) {
    if (!card || !card.name) return;

    const primaryName = card.name.split(' // ')[0];

    if (!cardsByName.has(primaryName)) {
      cardsByName.set(primaryName, []);
    }

    const printings = cardsByName.get(primaryName);
    if (!printings.some(p => p.id === card.id)) {
      printings.push(card);
      printings.sort((a, b) => new Date(a.released_at) - new Date(b.released_at));
    }
  },

  getPrintings(name) {
    const primaryName = name.split(' // ')[0];
    return cardsByName.get(primaryName) || [];
  },

  getOldestPrinting(name) {
    const printings = this.getPrintings(name);
    return printings.length > 0 ? printings[0] : undefined;
  },

  getAll() {
    return Array.from(cardsByName.values()).map(printings => printings[0]);
  },

  clear() {
    cardsByName.clear();
  }
};
