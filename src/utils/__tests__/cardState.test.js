// src/utils/__tests__/cardState.test.js
/* globals global */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadCardStates,
  isCardMissing,
  toggleCardOwned,
  setCardsOwned,
  ownedCards,
} from '../../cardState';

vi.mock('../../main.js', () => ({
  mainState: {
    loggedInUserId: null,
    guestUserId: null,
  },
}));

vi.mock('../../ui/ownedCounter', () => ({
  updateOwnedCounter: vi.fn(),
}));
vi.mock('../../clerk.js', () => ({
    getClerk: () => ({
        session: {
            getToken: () => Promise.resolve('test-token')
        }
    })
}));


global.fetch = vi.fn();

describe('cardState', () => {
  beforeEach(async () => {
    ownedCards.clear();
    vi.clearAllMocks();
    // Ensure the module is "initialized" for isCardMissing tests
    const mockResponse = { ok: true, json: () => Promise.resolve([]) };
    fetch.mockResolvedValue(mockResponse);
    await loadCardStates();
    // Clear mocks again to not interfere with specific test setups
    vi.clearAllMocks();
  });

  describe('loadCardStates', () => {
    it('should load card states for a logged-in user', async () => {
      const { mainState } = await import('../../main.js');
      mainState.loggedInUserId = 'user123';
      mainState.guestUserId = null;

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
      const { mainState } = await import('../../main.js');
      mainState.loggedInUserId = null;
      mainState.guestUserId = 'guest123';

      const mockResponse = {
        ok: true,
        json: () => Promise.resolve([{ cardId: 'card3' }]),
      };
      fetch.mockResolvedValue(mockResponse);

      await loadCardStates();

      expect(ownedCards.has('card3')).toBe(true);
    });
  });

  describe('isCardMissing', () => {
    it('should return true if a card is not in the owned set', () => {
      ownedCards.add('card1');
      const card = { id: 'card2' };
      const result = isCardMissing(card);
      expect(result).toBe(true);
    });

    it('should return false if a card is in the owned set', () => {
      ownedCards.add('card1');
      const card = { id: 'card1' };
      const result = isCardMissing(card);
      expect(result).toBe(false);
    });
  });

  describe('toggleCardOwned', () => {
    it('should add a card to the owned set if it is missing', async () => {
      const { mainState } = await import('../../main.js');
      mainState.loggedInUserId = 'user123';
      const card = { id: 'card1' };
      await toggleCardOwned(card);
      expect(ownedCards.has('card1')).toBe(true);
    });

    it('should remove a card from the owned set if it is present', async () => {
      const { mainState } = await import('../../main.js');
      mainState.loggedInUserId = 'user123';
      ownedCards.add('card1');
      const card = { id: 'card1' };
      await toggleCardOwned(card);
      expect(ownedCards.has('card1')).toBe(false);
    });
  });

  describe('setCardsOwned', () => {
    it('should add multiple cards to the owned set', async () => {
      const { mainState } = await import('../../main.js');
      mainState.loggedInUserId = 'user123';
      const cards = [{ id: 'card1' }, { id: 'card2' }];
      await setCardsOwned(cards, true);
      expect(ownedCards.has('card1')).toBe(true);
      expect(ownedCards.has('card2')).toBe(true);
    });

    it('should remove multiple cards from the owned set', async () => {
      const { mainState } = await import('../../main.js');
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
