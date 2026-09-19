// src/state/__tests__/cardState.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadCardStates,
  isCardOwned,
  toggleCardOwned,
  setCardsOwned,
  getOwnedCardIds,
  getOwnedAddedAt,
  mergeLocalCollectionToAccount,
} from '../../state/cardState.js';
import { mainState } from '../mainState.js';
import { cardStore } from '../../state/cardStore.js';
import {
  addLocalCard,
  clearLocalCollection,
  loadLocalCollection,
  removeLocalCards,
} from '../localCollection.js';
import { mergeOwnedCollection } from '../../api/mergeOwned.js';

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

vi.mock('../localCollection.js', () => ({
  loadLocalCollection: vi.fn(() => Promise.resolve([])),
  addLocalCard: vi.fn(() => Promise.resolve(true)),
  removeLocalCards: vi.fn(() => Promise.resolve()),
  clearLocalCollection: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../api/mergeOwned.js', () => ({
  mergeOwnedCollection: vi.fn(() => Promise.resolve([])),
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

  describe('local (signed-out) mode', () => {
    beforeEach(() => {
      mainState.loggedInUserId = null;
      mainState.shareToken = null;
      cardStore.getPrintings.mockReturnValue([]);
      loadLocalCollection.mockResolvedValue([]);
      addLocalCard.mockResolvedValue(true);
      removeLocalCards.mockResolvedValue(undefined);
      clearLocalCollection.mockResolvedValue(undefined);
      mergeOwnedCollection.mockResolvedValue([]);
    });

    it('marks a card locally without hitting the server', async () => {
      const owned = await toggleCardOwned({ id: 'local-1' });

      expect(owned).toBe(true);
      expect(ownedCards.has('local-1')).toBe(true);
      expect(addLocalCard).toHaveBeenCalledWith('local-1', expect.any(String));
      expect(fetch).not.toHaveBeenCalled();
    });

    it('removes every printing of the name locally', async () => {
      cardStore.getPrintings.mockReturnValue([{ id: 'local-1' }, { id: 'local-1b' }]);
      ownedCards.add('local-1');
      ownedCards.add('local-1b');

      const owned = await toggleCardOwned({ id: 'local-1', name: 'Local One' });

      expect(owned).toBe(false);
      expect(ownedCards.has('local-1')).toBe(false);
      expect(ownedCards.has('local-1b')).toBe(false);
      const removed = removeLocalCards.mock.calls[0][0];
      expect([...removed].sort()).toEqual(['local-1', 'local-1b']);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('hydrates owned ids from IndexedDB', async () => {
      loadLocalCollection.mockResolvedValueOnce([
        { cardId: 'stored-1', addedAt: '2024-01-01T00:00:00.000Z' },
      ]);

      await loadCardStates();

      expect(ownedCards.has('stored-1')).toBe(true);
      expect(getOwnedAddedAt().get('stored-1')).toBe('2024-01-01T00:00:00.000Z');
    });

    it('records a local batch change without hitting the server', async () => {
      await setCardsOwned([{ id: 'a' }, { id: 'b' }], true);

      expect(ownedCards.has('a')).toBe(true);
      expect(ownedCards.has('b')).toBe(true);
      expect(addLocalCard).toHaveBeenCalledTimes(2);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('merges the local collection into the account and clears it', async () => {
      mainState.loggedInUserId = 'user123';
      loadLocalCollection.mockResolvedValueOnce([{ cardId: 'a' }, { cardId: 'b' }]);

      const merged = await mergeLocalCollectionToAccount();

      expect(merged).toBe(true);
      expect(mergeOwnedCollection).toHaveBeenCalledWith(['a', 'b']);
      expect(clearLocalCollection).toHaveBeenCalledTimes(1);
    });

    it('keeps local records when the merge fails', async () => {
      mainState.loggedInUserId = 'user123';
      loadLocalCollection.mockResolvedValueOnce([{ cardId: 'a' }]);
      mergeOwnedCollection.mockRejectedValueOnce(new Error('offline'));

      await expect(mergeLocalCollectionToAccount()).rejects.toThrow('offline');
      expect(clearLocalCollection).not.toHaveBeenCalled();
    });

    it('does nothing when there is nothing local to merge', async () => {
      mainState.loggedInUserId = 'user123';
      loadLocalCollection.mockResolvedValueOnce([]);

      await expect(mergeLocalCollectionToAccount()).resolves.toBe(false);
      expect(mergeOwnedCollection).not.toHaveBeenCalled();
    });
  });
});
