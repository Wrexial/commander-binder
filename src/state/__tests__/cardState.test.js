// src/state/__tests__/cardState.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadCardStates,
  isCardOwned,
  toggleCardOwned,
  setCardsOwned,
  getOwnedCardIds,
  getOwnedAddedAt,
} from '../../state/cardState.js';

vi.mock('../mainState.js', () => ({
  mainState: {
    loggedInUserId: null,
    shareToken: null,
  },
}));

vi.mock('../../state/cardStore.js', () => ({
  cardStore: {
    getPrintings: vi.fn(() => []),
  },
}));

vi.mock('../../auth/clerk.js', () => ({
  getClerk: () => ({
    session: {
      getToken: () => Promise.resolve('test-token'),
    },
  }),
}));

globalThis.fetch = vi.fn();

describe('cardState', () => {
  let ownedCards;

  beforeEach(async () => {
    ownedCards = getOwnedCardIds();
    ownedCards.clear();
    getOwnedAddedAt().clear();
    vi.clearAllMocks();
    // Ensure the module is "initialized" for isCardOwned tests
    const mockResponse = { ok: true, json: () => Promise.resolve([]) };
    fetch.mockResolvedValue(mockResponse);
    await loadCardStates();
    // Clear mocks again to not interfere with specific test setups
    vi.clearAllMocks();
  });

  describe('loadCardStates', () => {
    it('should load card states for a logged-in user', async () => {
      const { mainState } = await import('../mainState.js');
      mainState.loggedInUserId = 'user123';
      mainState.shareToken = null;

      const mockResponse = {
        ok: true,
        json: () => Promise.resolve([{ cardId: 'card1' }, { cardId: 'card2' }]),
      };
      fetch.mockResolvedValue(mockResponse);

      await loadCardStates();

      expect(ownedCards.has('card1')).toBe(true);
      expect(ownedCards.has('card2')).toBe(true);
    });

    it('should load card states for a guest user', async () => {
      const { mainState } = await import('../mainState.js');
      mainState.loggedInUserId = null;
      mainState.shareToken = 'share123';

      const mockResponse = {
        ok: true,
        json: () => Promise.resolve([{ cardId: 'card3' }]),
      };
      fetch.mockResolvedValue(mockResponse);

      await loadCardStates();

      expect(ownedCards.has('card3')).toBe(true);
    });

    it('records when each card was added', async () => {
      const { mainState } = await import('../mainState.js');
      mainState.loggedInUserId = 'user123';
      mainState.shareToken = null;

      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ cardId: 'card1', createdAt: '2024-01-01T00:00:00.000Z' }]),
      });

      await loadCardStates();

      expect(getOwnedAddedAt().get('card1')).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('isCardOwned', () => {
    it('should return false if a card is not in the owned set', () => {
      ownedCards.add('card1');
      const card = { id: 'card2' };
      const result = isCardOwned(card);
      expect(result).toBe(false);
    });

    it('should return true if a card is in the owned set', () => {
      ownedCards.add('card1');
      const card = { id: 'card1' };
      const result = isCardOwned(card);
      expect(result).toBe(true);
    });
  });

  describe('toggleCardOwned', () => {
    it('should add a card to the owned set if it is missing', async () => {
      const { mainState } = await import('../mainState.js');
      mainState.loggedInUserId = 'user123';
      const card = { id: 'card1' };
      await toggleCardOwned(card);
      expect(ownedCards.has('card1')).toBe(true);
    });

    it('should remove a card from the owned set if it is present', async () => {
      const { mainState } = await import('../mainState.js');
      mainState.loggedInUserId = 'user123';
      ownedCards.add('card1');
      const card = { id: 'card1' };
      await toggleCardOwned(card);
      expect(ownedCards.has('card1')).toBe(false);
    });

    it('stamps a newly owned card and forgets it when removed', async () => {
      const { mainState } = await import('../mainState.js');
      mainState.loggedInUserId = 'user123';
      const card = { id: 'card1' };

      await toggleCardOwned(card);
      expect(typeof getOwnedAddedAt().get('card1')).toBe('string');

      await toggleCardOwned(card);
      expect(getOwnedAddedAt().has('card1')).toBe(false);
    });
  });

  describe('setCardsOwned', () => {
    it('should add multiple cards to the owned set', async () => {
      const { mainState } = await import('../mainState.js');
      mainState.loggedInUserId = 'user123';
      const cards = [{ id: 'card1' }, { id: 'card2' }];
      await setCardsOwned(cards, true);
      expect(ownedCards.has('card1')).toBe(true);
      expect(ownedCards.has('card2')).toBe(true);
    });

    it('should remove multiple cards from the owned set', async () => {
      const { mainState } = await import('../mainState.js');
      mainState.loggedInUserId = 'user123';
      ownedCards.add('card1');
      ownedCards.add('card2');
      const cards = [{ id: 'card1' }, { id: 'card2' }];
      await setCardsOwned(cards, false);
      expect(ownedCards.has('card1')).toBe(false);
      expect(ownedCards.has('card2')).toBe(false);
    });
  });
});
