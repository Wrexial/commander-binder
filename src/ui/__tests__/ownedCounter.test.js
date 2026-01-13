import { vi, describe, it, expect, beforeEach } from 'vitest';
import { updateOwnedCounter } from '../ownedCounter.js';
import { appState } from '../../appState.js';
import { ownedCards } from '../../cardState.js';

// Mock dependencies from other modules
vi.mock('../../appState.js', () => ({
  appState: {
    seenNames: new Set(),
  },
}));

vi.mock('../../cardState.js', () => ({
  ownedCards: new Set(),
}));

describe('updateOwnedCounter', () => {
  let ownedCounterEl, searchInputEl;

  beforeEach(() => {
    // Reset mocks and DOM
    vi.clearAllMocks();
    appState.seenNames.clear();
    ownedCards.clear();
    document.body.innerHTML = `
      <div id="owned-counter"></div>
      <input id="search-input" value="" />
      <div id="card-grid"></div>
    `;
    ownedCounterEl = document.getElementById('owned-counter');
    searchInputEl = document.getElementById('search-input');

    // Helper to create card elements
    const createCard = (id, isOwned, isVisible) => {
      const card = document.createElement('div');
      card.classList.add('card');
      card.cardData = { id };
      card.style.display = isVisible ? 'block' : 'none';
      if (isOwned) {
        ownedCards.add(id);
      }
      document.getElementById('card-grid').appendChild(card);
    };

    // Create some card elements for testing
    createCard('card1', true, true);   // Owned, Visible
    createCard('card2', false, true);  // Not Owned, Visible
    createCard('card3', true, false);  // Owned, Hidden
    createCard('card4', false, false); // Not Owned, Hidden
    createCard('card5', true, true);   // Owned, Visible
  });

  it('should display total owned count when search input is empty', () => {
    appState.seenNames.add('Card A');
    appState.seenNames.add('Card B');
    appState.seenNames.add('Card C');
    appState.seenNames.add('Card D');
    
    searchInputEl.value = '';
    updateOwnedCounter();
    
    // ownedCards has 'card1', 'card3', 'card5' = 3
    // appState.seenNames has 4
    expect(ownedCounterEl.textContent).toBe('Owned: 3 / 4');
  });

  it('should display search-specific counts when search input has value', () => {
    searchInputEl.value = 'test search';
    updateOwnedCounter();

    // Visible cards: card1, card2, card5 (length 3)
    // Owned and visible: card1, card5 (length 2)
    // Total owned: 3
    expect(ownedCounterEl.textContent).toBe('Owned: 2 of 3 shown (3 total)');
  });

  it('should not throw an error if the counter or search input element is missing', () => {
    document.body.innerHTML = '';
    expect(() => updateOwnedCounter()).not.toThrow();
  });
  
  it('should handle a scenario with no cards in the DOM', () => {
    document.getElementById('card-grid').innerHTML = '';
    searchInputEl.value = 'search with no results';
    updateOwnedCounter();

    expect(ownedCounterEl.textContent).toBe('Owned: 0 of 0 shown (3 total)');
  });
});
