import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../idb.js';
import { installFakeIndexedDB } from './fakeIndexedDB.js';

describe('createStore', () => {
  let fake;

  beforeEach(() => {
    fake = null;
  });

  afterEach(() => {
    fake?.restore();
  });

  describe('without IndexedDB (jsdom, private mode)', () => {
    let store;

    beforeEach(() => {
      store = createStore({ dbName: 'test', storeName: 'records' });
    });

    it('degrades to memory-only reads', async () => {
      expect(await store.get('missing')).toBeNull();
      expect(await store.getAll()).toEqual([]);
    });

    it('reports failed writes instead of throwing', async () => {
      expect(await store.put({ key: 'a', value: 1 })).toBe(false);
      expect(await store.remove('a')).toBe(false);
      await expect(store.clear()).resolves.toBeUndefined();
    });
  });

  describe('with IndexedDB', () => {
    let store;

    beforeEach(() => {
      fake = installFakeIndexedDB();
      store = createStore({ dbName: 'test', storeName: 'records' });
    });

    it('creates the object store on first open', async () => {
      expect(await store.get('missing')).toBeNull();
      expect(fake.openCount()).toBe(1);
    });

    it('round-trips a value', async () => {
      expect(await store.put({ key: 'a', value: { nested: true } })).toBe(true);

      expect(await store.get('a')).toEqual({ key: 'a', value: { nested: true } });
    });

    it('returns every stored value', async () => {
      await store.put({ key: 'a', value: 1 });
      await store.put({ key: 'b', value: 2 });

      const all = await store.getAll();

      expect(all).toHaveLength(2);
      expect(all.map((record) => record.key).sort()).toEqual(['a', 'b']);
    });

    it('reuses one connection for later operations', async () => {
      await store.put({ key: 'a', value: 1 });
      await store.get('a');
      await store.getAll();

      expect(fake.openCount()).toBe(1);
    });

    it('removes a single record and clears the rest', async () => {
      await store.put({ key: 'a', value: 1 });
      await store.put({ key: 'b', value: 2 });

      expect(await store.remove('a')).toBe(true);
      expect(await store.get('a')).toBeNull();

      await store.clear();
      expect(await store.getAll()).toEqual([]);
    });
  });

  describe('when IndexedDB misbehaves', () => {
    it('falls back when open() throws', async () => {
      fake = installFakeIndexedDB({ throwOnOpen: true });
      const store = createStore({ dbName: 'test', storeName: 'records' });

      expect(await store.get('a')).toBeNull();
      expect(await store.put({ key: 'a' })).toBe(false);
    });

    it('falls back when the object store is gone', async () => {
      fake = installFakeIndexedDB({ throwOnTransaction: true });
      const store = createStore({ dbName: 'test', storeName: 'records' });

      expect(await store.getAll()).toEqual([]);
      expect(await store.remove('a')).toBe(false);
      await expect(store.clear()).resolves.toBeUndefined();
    });
  });
});
