import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import { installFakeIndexedDB } from '../../utils/__tests__/fakeIndexedDB.js';
import {
  beginCardArchiveBuild,
  clearCardArchive,
  createCardArchiveBuilder,
  hasCardArchive,
  readArchivedCards,
  readCardArchiveMeta,
  resetCardArchiveCache,
  slimCard,
} from '../cardArchive.js';

let fake;

beforeAll(() => {
  fake = installFakeIndexedDB();
});

afterAll(() => {
  fake?.restore();
});

beforeEach(async () => {
  await clearCardArchive();
});

function makeCard(overrides = {}) {
  return {
    id: overrides.id || overrides.name,
    name: overrides.name || 'Test Card',
    set: 'tst',
    set_name: 'Test Set',
    released_at: '2020-01-01',
    games: ['paper'],
    type_line: 'Creature — Human',
    ...overrides,
  };
}

describe('slimCard', () => {
  it('keeps only the fields the UI renders', () => {
    const slim = slimCard({
      id: 'a',
      name: 'A',
      image_uris: { thumb: 't', grid: 'g', normal: 'n', large: 'l', art_crop: 'c' },
      related_uris: { edhrec: 'e', scryfall: 's' },
      legalities: { modern: 'legal' },
      oracle_id: 'oracle',
    });

    expect(slim.image_uris).toEqual({ thumb: 't', grid: 'g', normal: 'n' });
    expect(slim.related_uris).toEqual({ edhrec: 'e' });
    expect(slim.legalities).toBeUndefined();
    expect(slim.oracle_id).toBeUndefined();
  });

  it('rejects cards without an id or name', () => {
    expect(slimCard({ name: 'No id' })).toBeNull();
    expect(slimCard({ id: 'x' })).toBeNull();
    expect(slimCard(null)).toBeNull();
  });
});

describe('cardArchive', () => {
  it('has no archive until finish publishes its meta', async () => {
    const builder = createCardArchiveBuilder({ memberSize: 2 });
    builder.add(makeCard({ id: 'a', name: 'A' }));

    expect(await hasCardArchive()).toBe(false);

    await builder.finish('2026-01-01T00:00:00Z');
    expect(await hasCardArchive()).toBe(true);
  });

  it('builds, indexes and reads cards back across members', async () => {
    const builder = createCardArchiveBuilder({ memberSize: 2 });
    for (let i = 0; i < 5; i++) builder.add(makeCard({ id: `id-${i}`, name: `Card ${i}` }));
    await builder.finish('2026-01-01T00:00:00Z');

    const meta = await readCardArchiveMeta();
    expect(meta.count).toBe(5);
    expect(meta.memberCount).toBe(3);
    expect(meta.updatedAt).toBe('2026-01-01T00:00:00Z');

    // Drop the in-memory caches so the read has to hit the persisted members.
    resetCardArchiveCache();
    const found = await readArchivedCards(['id-0', 'id-3', 'missing']);

    expect(found.get('id-0').name).toBe('Card 0');
    expect(found.get('id-3').name).toBe('Card 3');
    expect(found.has('missing')).toBe(false);
  });

  it('beginCardArchiveBuild invalidates the published meta', async () => {
    const builder = createCardArchiveBuilder();
    builder.add(makeCard({ id: 'a', name: 'A' }));
    await builder.finish(null);
    expect(await hasCardArchive()).toBe(true);

    await beginCardArchiveBuild();
    expect(await hasCardArchive()).toBe(false);
  });

  it('clearCardArchive removes the archive', async () => {
    const builder = createCardArchiveBuilder();
    builder.add(makeCard({ id: 'a', name: 'A' }));
    await builder.finish(null);

    await clearCardArchive();

    expect(await hasCardArchive()).toBe(false);
    expect(await readArchivedCards(['a'])).toEqual(new Map());
  });
});
