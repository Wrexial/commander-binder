// src/utils/__tests__/cardState.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadCardStates,
  isCardMissing,
  toggleCardOwned,
  setCardsOwned,
  ownedCards,
} from '../../cardState';
import * as main from '../../main';

vi.mock('../../ui/ownedCounter', () => ({
  updateOwnedCounter: vi.fn(),
}));

global.fetch = vi.fn();

describe('cardState', () => {
  beforeEach(() => {
    ownedCards.clear();
    vi.clearAllMocks();
  });

  describe('loadCardStates', () => {
    it('should load card states for a logged-in user', async () => {
      vi.spyOn(main, 'loggedInUserId', 'get').mockReturnValue('user123');
      vi.spyOn(main, 'guestUserId', 'get').mockReturnValue(null);

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
      vi.spyOn(main, 'loggedInUserId', 'get').mockReturnValue(null);
      vi.spyOn(main, 'guestUserId', 'get').mockReturnValue('guest123');

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
      vi.spyOn(main, 'loggedInUserId', 'get').mockReturnValue('user123');
      const card = { id: 'card1' };
      await toggleCardOwned(card);
      expect(ownedCards.has('card1')).toBe(true);
    });

    it('should remove a card from the owned set if it is present', async () => {
      vi.spyOn(main, 'loggedInUserId', 'get').mockReturnValue('user123');
      ownedCards.add('card1');
      const card = { id: 'card1' };
      await toggleCardOwned(card);
      expect(ownedCards.has('card1')).toBe(false);
    });
  });

  describe('setCardsOwned', () => {
    it('should add multiple cards to the owned set', async () => {
      vi.spyOn(main, 'loggedInUserId', 'get').mockReturnValue('user123');
      const cards = [{ id: 'card1' }, { id: 'card2' }];
      await setCardsOwned(cards, true);
      expect(ownedCards.has('card1')).toBe(true);
      expect(ownedCards.has('card2')).toBe(true);
    });

    it('should remove multiple cards from the owned set', async () => {
      vi.spyOn(main, 'loggedInUserId', 'get').mockReturnValue('user123');
      ownedCards.add('card1');
      ownedCards.add('card2');
      const cards = [{ id: 'card1' }, { id: 'card2' }];
      await setCardsOwned(cards, false);
      expect(ownedCards.has('card1')).toBe(false);
      expect(ownedCards.has('card2')).toBe(false);
    });
  });
});
