import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/clerk.js', () => ({ getClerk: vi.fn(() => ({ user: null })) }));
vi.mock('../../api/authenticatedFetch.js', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('../localCollection.js', () => ({ loadLocalCollection: vi.fn(() => Promise.resolve([])) }));
vi.mock('../localWishlist.js', () => ({
  addLocalWishlistCard: vi.fn(() => Promise.resolve(true)),
}));

import {
  addToViewerWishlist,
  getViewerCollectionIds,
  loadViewerCollection,
} from '../compareState.js';
import { getClerk } from '../../auth/clerk.js';
import { authenticatedFetch } from '../../api/authenticatedFetch.js';
import { loadLocalCollection } from '../localCollection.js';
import { addLocalWishlistCard } from '../localWishlist.js';

describe('compareState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClerk.mockReturnValue({ user: null });
    loadLocalCollection.mockResolvedValue([]);
  });

  it('loads a signed-in viewer from the server without a share token', async () => {
    getClerk.mockReturnValue({ user: { id: 'u1' } });
    authenticatedFetch.mockResolvedValue({ ok: true, json: async () => [{ cardId: 'a' }] });

    const ids = await loadViewerCollection();

    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/.netlify/functions/owned-cards',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) })
    );
    expect([...ids]).toEqual(['a']);
    expect(loadLocalCollection).not.toHaveBeenCalled();
  });

  it('loads a signed-out viewer from the device-local collection', async () => {
    loadLocalCollection.mockResolvedValue([{ cardId: 'local-1' }]);

    const ids = await loadViewerCollection();

    expect(loadLocalCollection).toHaveBeenCalled();
    expect([...ids]).toEqual(['local-1']);
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('replaces, rather than accumulates, ids between loads', async () => {
    getClerk.mockReturnValue({ user: { id: 'u1' } });
    authenticatedFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ cardId: 'a' }] });
    await loadViewerCollection();

    authenticatedFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ cardId: 'b' }] });
    const ids = await loadViewerCollection();

    expect([...ids]).toEqual(['b']);
    expect([...getViewerCollectionIds()]).toEqual(['b']);
  });

  it('ignores a failed or malformed server response', async () => {
    getClerk.mockReturnValue({ user: { id: 'u1' } });
    authenticatedFetch.mockResolvedValueOnce({ ok: false, json: async () => [] });

    await expect(loadViewerCollection()).resolves.toEqual(new Set());

    authenticatedFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ nope: true }) });
    await expect(loadViewerCollection()).resolves.toEqual(new Set());
  });

  it('adds to the account wishlist when signed in', async () => {
    getClerk.mockReturnValue({ user: { id: 'u1' } });
    authenticatedFetch.mockResolvedValue({ ok: true });

    await addToViewerWishlist(['a', 'b']);

    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/.netlify/functions/batch-toggle-wishlist',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ cardIds: ['a', 'b'], isOwned: true }),
      })
    );
  });

  it('mirrors wishlist picks to the device store for guests', async () => {
    getClerk.mockReturnValue({ user: null });

    await addToViewerWishlist(['a']);

    expect(addLocalWishlistCard).toHaveBeenCalledWith('a');
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });
});
