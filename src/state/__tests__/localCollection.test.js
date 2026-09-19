import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { installFakeIndexedDB } from '../../utils/__tests__/fakeIndexedDB.js';

describe('localCollection', () => {
  let fake;
  let local;

  beforeAll(async () => {
    fake = installFakeIndexedDB();
    local = await import('../localCollection.js');
  });

  afterAll(() => fake.restore());

  beforeEach(async () => {
    await local.clearLocalCollection();
  });

  it('round-trips a locally-owned card', async () => {
    await local.addLocalCard('card-1', '2024-01-01T00:00:00.000Z');

    await expect(local.loadLocalCollection()).resolves.toEqual([
      { cardId: 'card-1', addedAt: '2024-01-01T00:00:00.000Z' },
    ]);
  });

  it('defaults addedAt to now', async () => {
    await local.addLocalCard('card-1');

    const [row] = await local.loadLocalCollection();
    expect(typeof row.addedAt).toBe('string');
  });

  it('returns the card ids', async () => {
    await local.addLocalCard('a');
    await local.addLocalCard('b');

    expect((await local.getLocalCardIds()).sort()).toEqual(['a', 'b']);
  });

  it('removes one or more cards', async () => {
    await local.addLocalCard('a');
    await local.addLocalCard('b');

    await local.removeLocalCards(['a']);

    expect(await local.getLocalCardIds()).toEqual(['b']);
  });

  it('clears the collection', async () => {
    await local.addLocalCard('a');

    await local.clearLocalCollection();

    await expect(local.getLocalCardIds()).resolves.toEqual([]);
  });
});

describe('localCollection without IndexedDB', () => {
  it('degrades to no-op reads and writes', async () => {
    vi.resetModules();
    const local = await import('../localCollection.js');

    await expect(local.loadLocalCollection()).resolves.toEqual([]);
    await expect(local.addLocalCard('a')).resolves.toBe(false);
    await expect(local.clearLocalCollection()).resolves.toBeUndefined();
  });
});
