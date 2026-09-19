import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../localWishlist.js', () => ({
  loadLocalWishlist: vi.fn(() => Promise.resolve([])),
  addLocalWishlistCard: vi.fn(() => Promise.resolve(true)),
  removeLocalWishlistCards: vi.fn(() => Promise.resolve()),
  clearLocalWishlist: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../api/mergeWishlist.js', () => ({
  mergeWishlistCollection: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../auth/clerk.js', () => ({
  getClerk: () => ({
    session: {
      getToken: () => Promise.resolve('test-token'),
    },
  }),
}));

globalThis.fetch = vi.fn();

import {
  loadWishlistStates,
  isCardWanted,
  toggleCardWanted,
  setCardsWanted,
  getWantedCardIds,
  mergeLocalWishlistToAccount,
} from '../wishlistState.js';
import { mainState } from '../mainState.js';
import { loadLocalWishlist, addLocalWishlistCard, clearLocalWishlist } from '../localWishlist.js';
import { mergeWishlistCollection } from '../../api/mergeWishlist.js';

describe('wishlistState', () => {
  beforeEach(async () => {
    getWantedCardIds().clear();
    vi.clearAllMocks();
    mainState.loggedInUserId = null;
    mainState.shareToken = null;
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    // Mark the collection initialized in the default (local) mode.
    await loadWishlistStates();
    vi.clearAllMocks();
  });

  it('loads the signed-in wishlist without sending a user id', async () => {
    mainState.loggedInUserId = 'user123';
    fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ cardId: 'w1' }]) });

    await loadWishlistStates();

    expect(fetch).toHaveBeenCalledWith(
      '/.netlify/functions/wishlist-cards',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) })
    );
    expect(isCardWanted({ id: 'w1', name: 'Wanted' })).toBe(true);
  });

  it('uses the share token for a share-link visitor', async () => {
    mainState.shareToken = 'share-token';
    fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ cardId: 'w1' }]) });

    await loadWishlistStates();

    expect(fetch).toHaveBeenCalledWith(
      '/.netlify/functions/wishlist-cards',
      expect.objectContaining({ body: JSON.stringify({ shareToken: 'share-token' }) })
    );
    expect(isCardWanted({ id: 'w1', name: 'Wanted' })).toBe(true);
  });

  it('toggles through the dedicated wishlist endpoint', async () => {
    mainState.loggedInUserId = 'user123';
    fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ isOwned: true }) });

    await expect(toggleCardWanted({ id: 'w1', name: 'Wanted' })).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledWith('/.netlify/functions/toggle-wishlist', expect.anything());
    expect(isCardWanted({ id: 'w1', name: 'Wanted' })).toBe(true);
  });

  it('uses the batch endpoint when clearing a whole name', async () => {
    const { cardStore } = await import('../cardStore.js');
    const printing = { id: 'w1', name: 'Wanted' };
    cardStore.getPrintings.mockReturnValue([printing]);
    mainState.loggedInUserId = 'user123';
    fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ isOwned: true }) });
    await toggleCardWanted(printing);
    vi.clearAllMocks();

    fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
    await expect(toggleCardWanted(printing)).resolves.toBe(false);

    expect(fetch).toHaveBeenCalledWith(
      '/.netlify/functions/batch-toggle-wishlist',
      expect.objectContaining({ body: expect.stringContaining('"isOwned":false') })
    );
    expect(isCardWanted(printing)).toBe(false);
  });

  it('loads and persists locally for guests', async () => {
    loadLocalWishlist.mockResolvedValueOnce([{ cardId: 'local-1' }]);
    await loadWishlistStates();

    expect(isCardWanted({ id: 'local-1', name: 'Local' })).toBe(true);
    expect(fetch).not.toHaveBeenCalled();

    await setCardsWanted([{ id: 'local-2', name: 'Local Two' }], true);
    expect(addLocalWishlistCard).toHaveBeenCalledWith('local-2', expect.any(String));
  });

  it('merges the local wishlist into the account and clears it', async () => {
    mainState.loggedInUserId = 'user123';
    loadLocalWishlist.mockResolvedValueOnce([{ cardId: 'a' }, { cardId: 'b' }]);

    await expect(mergeLocalWishlistToAccount()).resolves.toBe(true);

    expect(mergeWishlistCollection).toHaveBeenCalledWith(['a', 'b']);
    expect(clearLocalWishlist).toHaveBeenCalled();
  });
});
