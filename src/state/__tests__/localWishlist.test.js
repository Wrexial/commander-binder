import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { installFakeIndexedDB } from '../../utils/__tests__/fakeIndexedDB.js';

describe('localWishlist', () => {
  let fake;
  let wishlist;

  beforeAll(async () => {
    fake = installFakeIndexedDB();
    wishlist = await import('../localWishlist.js');
  });

  afterAll(() => fake.restore());

  beforeEach(async () => {
    await wishlist.clearLocalWishlist();
  });

  it('round-trips a locally-wanted card', async () => {
    await wishlist.addLocalWishlistCard('w1', '2024-01-01T00:00:00.000Z');

    await expect(wishlist.loadLocalWishlist()).resolves.toEqual([
      { cardId: 'w1', addedAt: '2024-01-01T00:00:00.000Z' },
    ]);
  });

  it('is independent from the owned store', async () => {
    const owned = await import('../localCollection.js');

    await owned.addLocalCard('owned-1');
    await wishlist.addLocalWishlistCard('wanted-1');

    expect(await wishlist.getLocalWishlistIds()).toEqual(['wanted-1']);
    expect(await owned.getLocalCardIds()).toEqual(['owned-1']);
  });

  it('removes and clears wanted cards', async () => {
    await wishlist.addLocalWishlistCard('a');
    await wishlist.addLocalWishlistCard('b');

    await wishlist.removeLocalWishlistCards(['a']);
    expect(await wishlist.getLocalWishlistIds()).toEqual(['b']);

    await wishlist.clearLocalWishlist();
    await expect(wishlist.getLocalWishlistIds()).resolves.toEqual([]);
  });
});
