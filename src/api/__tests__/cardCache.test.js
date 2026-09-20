import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import { installFakeIndexedDB } from '../../utils/__tests__/fakeIndexedDB.js';
import {
  clearCardCache,
  clearCardCacheMemory,
  isCardFresh,
  readCachedCards,
  writeCachedCards,
} from '../cardCache.js';
import { CACHE_TTL_MS } from '../responseCache.js';

let fake;

beforeAll(() => {
  fake = installFakeIndexedDB();
});

afterAll(() => {
  fake?.restore();
});

beforeEach(async () => {
  await clearCardCache();
});

describe('cardCache', () => {
  it('returns nothing for unknown ids', async () => {
    expect(await readCachedCards(['nope'])).toEqual(new Map());
  });

  it('persists cards by printing id across memory clears', async () => {
    await writeCachedCards([{ id: 'a', name: 'Sol Ring' }]);
    clearCardCacheMemory();

    const found = await readCachedCards(['a', 'b']);

    expect(found.get('a')).toEqual({ id: 'a', name: 'Sol Ring' });
    expect(found.has('b')).toBe(false);
  });

  it('skips records past the TTL unless allowStale is set', async () => {
    const stale = Date.now() - CACHE_TTL_MS - 1;
    await writeCachedCards([{ id: 'old', name: 'Old Card' }], stale);

    expect(isCardFresh({ ts: stale })).toBe(false);
    expect(await readCachedCards(['old'])).toEqual(new Map());

    const staleFound = await readCachedCards(['old'], { allowStale: true });
    expect(staleFound.get('old')).toEqual({ id: 'old', name: 'Old Card' });
  });

  it('ignores cards without an id and records without a card', async () => {
    await writeCachedCards([{ name: 'no id' }, null]);
    expect(await readCachedCards(['no id'])).toEqual(new Map());
  });

  it('clearCardCache empties both layers', async () => {
    await writeCachedCards([{ id: 'a', name: 'A' }]);
    await clearCardCache();

    expect(await readCachedCards(['a'])).toEqual(new Map());
  });
});
