import { describe, it, expect, beforeEach } from 'vitest';
import {
  readCache,
  writeCache,
  removeCache,
  clearCache,
  isFresh,
  CACHE_TTL_MS,
} from '../responseCache.js';

describe('responseCache', () => {
  beforeEach(async () => {
    await clearCache();
  });

  it('returns null for an unknown url', async () => {
    expect(await readCache('https://example.com/nope')).toBeNull();
  });

  it('stores and reads a response', async () => {
    await writeCache('https://example.com/a', { hello: 'world' }, 'etag-1');
    const record = await readCache('https://example.com/a');

    expect(record).not.toBeNull();
    expect(record.data).toEqual({ hello: 'world' });
    expect(record.etag).toBe('etag-1');
    expect(typeof record.ts).toBe('number');
  });

  it('defaults a missing etag to null', async () => {
    await writeCache('https://example.com/no-etag', { a: 1 });
    const record = await readCache('https://example.com/no-etag');
    expect(record.etag).toBeNull();
  });

  it('isFresh respects the TTL boundary', () => {
    const now = 1_000_000_000_000;
    expect(isFresh({ ts: now }, now)).toBe(true);
    expect(isFresh({ ts: now - CACHE_TTL_MS + 1 }, now)).toBe(true);
    expect(isFresh({ ts: now - CACHE_TTL_MS }, now)).toBe(false);
    expect(isFresh({ ts: now - CACHE_TTL_MS - 5000 }, now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });

  it('removeCache drops a single entry', async () => {
    await writeCache('https://example.com/b', { a: 1 });
    await removeCache('https://example.com/b');
    expect(await readCache('https://example.com/b')).toBeNull();
  });

  it('clearCache empties the store', async () => {
    await writeCache('https://example.com/c', { a: 1 });
    await clearCache();
    expect(await readCache('https://example.com/c')).toBeNull();
  });
});
