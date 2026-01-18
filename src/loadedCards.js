// src/loadedCards.js

const loadedCards = new Map();

export const cardStore = {
  add(card) {
    if (card && card.id && !loadedCards.has(card.id)) {
      loadedCards.set(card.id, card);
    }
  },
  
  getById(id) {
    return loadedCards.get(id);
  },

  getAll() {
    return Array.from(loadedCards.values());
  },
  
  clear() {
    loadedCards.clear();
  }
};
