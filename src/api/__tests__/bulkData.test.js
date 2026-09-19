import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isLegendaryCreature,
  isPlayableLegendaryCreature,
  readJsonlLines,
  loadBulkIndex,
  getBulkEntry,
  downloadFilteredBulkCards,
  getLegendaryCreatures,
  verifyBulkCoverage,
  clearBulkCache,
  SUBSET_TTL_MS,
} from '../bulkData.js';
import { getCatalogNames, isCardCatalogLoaded, resetCardCatalog } from '../../state/cardCatalog.js';

function makeCard(overrides = {}) {
  return {
    id: overrides.id || overrides.name,
    name: overrides.name,
    type_line: 'Legendary Creature — Human',
    released_at: '2020-01-01',
    games: ['paper'],
    set: 'tst',
    set_name: 'Test Set',
    ...overrides,
  };
}

function streamFromBytes(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function gzipBytes(text) {
  const source = streamFromBytes(new TextEncoder().encode(text));
  const compressed = source.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function mockResponse({
  body = null,
  url = '',
  contentType = 'application/json',
  ok = true,
  status = 200,
  text = '',
} = {}) {
  return {
    ok,
    status,
    url,
    body,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => text,
  };
}

describe('bulkData', () => {
  beforeEach(async () => {
    await clearBulkCache();
    resetCardCatalog();
    global.fetch = vi.fn();
  });

  it('detects legendary creatures the same way the search filter does', () => {
    expect(isLegendaryCreature(makeCard({ type_line: 'Legendary Creature — Human' }))).toBe(true);
    expect(
      isLegendaryCreature(makeCard({ type_line: 'Legendary Artifact Creature — Golem' }))
    ).toBe(true);
    expect(isLegendaryCreature(makeCard({ type_line: 'Creature — Elf' }))).toBe(false);
    expect(isLegendaryCreature(makeCard({ type_line: 'Legendary Planeswalker — Ajani' }))).toBe(
      false
    );
    expect(isLegendaryCreature(null)).toBe(false);
  });

  it('excludes non-playable layouts from the bulk view', () => {
    expect(isPlayableLegendaryCreature(makeCard({}))).toBe(true);
    expect(isPlayableLegendaryCreature(makeCard({ layout: 'token' }))).toBe(false);
    expect(isPlayableLegendaryCreature(makeCard({ layout: 'double_faced_token' }))).toBe(false);
    expect(isPlayableLegendaryCreature(makeCard({ layout: 'emblem' }))).toBe(false);
    expect(isPlayableLegendaryCreature(makeCard({ games: ['mtgo'] }))).toBe(false);
    expect(isPlayableLegendaryCreature(makeCard({ type_line: 'Creature — Elf' }))).toBe(false);
  });

  it('streams plain JSONL lines, skipping blanks', async () => {
    const body = streamFromBytes(new TextEncoder().encode('{"a":1}\n\n{"b":2}\n'));
    const res = mockResponse({ body, contentType: 'application/x-ndjson' });

    const lines = [];
    for await (const line of readJsonlLines(res)) lines.push(line);

    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('decompresses gzip JSONL responses', async () => {
    const body = streamFromBytes(await gzipBytes('{"a":1}\n{"b":2}'));
    const res = mockResponse({
      body,
      url: 'https://data.scryfall.io/default-cards/default-cards-1.jsonl.gz',
      contentType: 'application/gzip',
    });

    const lines = [];
    for await (const line of readJsonlLines(res)) lines.push(line);

    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('throws for an unknown bulk type', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    await expect(getBulkEntry('nope')).rejects.toThrow('No Scryfall bulk-data entry');
  });

  it('downloads, filters and sorts legendary creatures', async () => {
    const entry = {
      type: 'default_cards',
      updated_at: '2026-09-12T21:05:31.691+00:00',
      jsonl_download_uri: 'https://data.scryfall.io/default-cards/cards.jsonl.gz',
    };
    const cards = [
      makeCard({ name: 'New Legend', released_at: '2024-05-01' }),
      makeCard({ name: 'Old Legend', released_at: '1994-06-01' }),
      makeCard({ name: 'Mono Creature', type_line: 'Creature — Elf' }),
      makeCard({ name: 'Digital Legend', games: ['mtgo'] }),
    ];
    const jsonl = cards.map((c) => JSON.stringify(c)).join('\n');

    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/bulk-data')) {
        return { ok: true, json: async () => ({ data: [entry] }) };
      }
      return mockResponse({
        body: streamFromBytes(await gzipBytes(jsonl)),
        url: entry.jsonl_download_uri,
        contentType: 'application/gzip',
      });
    });

    const subset = await getLegendaryCreatures();

    expect(subset.cards.map((c) => c.name)).toEqual(['Old Legend', 'New Legend']);
    expect(subset.updatedAt).toBe(entry.updated_at);

    // The same stream builds a catalog of *every* card name, legendary or not.
    expect(subset.cardNames).toEqual([
      'Digital Legend',
      'Mono Creature',
      'New Legend',
      'Old Legend',
    ]);
    expect(subset.cardNameById['Mono Creature']).toBe('Mono Creature');
    expect(isCardCatalogLoaded()).toBe(true);
    expect(getCatalogNames()).toContain('Digital Legend');

    const downloadCalls = global.fetch.mock.calls.filter(([u]) =>
      String(u).includes('cards.jsonl.gz')
    );
    expect(downloadCalls).toHaveLength(1);
  });

  it('does not send custom headers on the bulk download (avoids a rejected CORS preflight)', async () => {
    const entry = {
      type: 'default_cards',
      updated_at: '2026-09-12T21:05:31.691+00:00',
      jsonl_download_uri: 'https://data.scryfall.io/default-cards/cards.jsonl.gz',
    };
    const jsonl = JSON.stringify(makeCard({ name: 'Legend' }));
    const calls = [];

    global.fetch.mockImplementation(async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('/bulk-data')) {
        return { ok: true, json: async () => ({ data: [entry] }) };
      }
      return mockResponse({
        body: streamFromBytes(await gzipBytes(jsonl)),
        url: entry.jsonl_download_uri,
        contentType: 'application/gzip',
      });
    });

    await getLegendaryCreatures();

    const download = calls.find((c) => c.url.includes('cards.jsonl.gz'));
    expect(download).toBeDefined();
    // A `User-Agent` header would make Firefox preflight data.scryfall.io,
    // which Cloudflare answers with a headerless 403.
    expect(download.options).toBeUndefined();
  });

  it('serves a repeat request from the subset cache', async () => {
    const entry = {
      type: 'default_cards',
      updated_at: '2026-09-12T21:05:31.691+00:00',
      jsonl_download_uri: 'https://data.scryfall.io/default-cards/cards.jsonl.gz',
    };
    const jsonl = JSON.stringify(makeCard({ name: 'Cached Legend' }));

    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/bulk-data')) {
        return { ok: true, json: async () => ({ data: [entry] }) };
      }
      return mockResponse({
        body: streamFromBytes(await gzipBytes(jsonl)),
        url: entry.jsonl_download_uri,
        contentType: 'application/gzip',
      });
    });

    await getLegendaryCreatures();
    await getLegendaryCreatures();

    const downloadCalls = global.fetch.mock.calls.filter(([u]) =>
      String(u).includes('cards.jsonl.gz')
    );
    expect(downloadCalls).toHaveLength(1);

    // The TTL fast path means the second call makes no network requests at all
    // (not even the bulk index).
    const indexCalls = global.fetch.mock.calls.filter(([u]) => String(u).includes('/bulk-data'));
    expect(indexCalls).toHaveLength(1);
  });

  it('re-downloads when Scryfall publishes a newer bulk file after the TTL', async () => {
    const entry = {
      type: 'default_cards',
      updated_at: '2026-09-12T21:05:31.691+00:00',
      jsonl_download_uri: 'https://data.scryfall.io/default-cards/cards.jsonl.gz',
    };
    const jsonl = JSON.stringify(makeCard({ name: 'Legend' }));

    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/bulk-data')) {
        return { ok: true, json: async () => ({ data: [entry] }) };
      }
      return mockResponse({
        body: streamFromBytes(await gzipBytes(jsonl)),
        url: entry.jsonl_download_uri,
        contentType: 'application/gzip',
      });
    });

    const base = 1_000_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);
    try {
      await getLegendaryCreatures();
      // A new bulk file is published after the cache window expires.
      nowSpy.mockReturnValue(base + SUBSET_TTL_MS + 1);
      entry.updated_at = '2026-09-13T21:05:31.691+00:00';
      await getLegendaryCreatures();
    } finally {
      nowSpy.mockRestore();
    }

    const downloadCalls = global.fetch.mock.calls.filter(([u]) =>
      String(u).includes('cards.jsonl.gz')
    );
    expect(downloadCalls).toHaveLength(2);
  });

  it('revalidates after the TTL without re-downloading an unchanged file', async () => {
    const entry = {
      type: 'default_cards',
      updated_at: '2026-09-12T21:05:31.691+00:00',
      jsonl_download_uri: 'https://data.scryfall.io/default-cards/cards.jsonl.gz',
    };
    const jsonl = JSON.stringify(makeCard({ name: 'Legend' }));

    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/bulk-data')) {
        return { ok: true, json: async () => ({ data: [entry] }) };
      }
      return mockResponse({
        body: streamFromBytes(await gzipBytes(jsonl)),
        url: entry.jsonl_download_uri,
        contentType: 'application/gzip',
      });
    });

    const base = 2_000_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);
    try {
      await getLegendaryCreatures();
      nowSpy.mockReturnValue(base + SUBSET_TTL_MS + 1);
      await getLegendaryCreatures();
    } finally {
      nowSpy.mockRestore();
    }

    const indexCalls = global.fetch.mock.calls.filter(([u]) => String(u).includes('/bulk-data'));
    const downloadCalls = global.fetch.mock.calls.filter(([u]) =>
      String(u).includes('cards.jsonl.gz')
    );
    expect(indexCalls).toHaveLength(2);
    expect(downloadCalls).toHaveLength(1);
  });

  it('serves the cached subset when the bulk index is unreachable', async () => {
    const entry = {
      type: 'default_cards',
      updated_at: '2026-09-12T21:05:31.691+00:00',
      jsonl_download_uri: 'https://data.scryfall.io/default-cards/cards.jsonl.gz',
    };
    const jsonl = JSON.stringify(makeCard({ name: 'Offline Legend' }));

    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/bulk-data')) {
        return { ok: true, json: async () => ({ data: [entry] }) };
      }
      return mockResponse({
        body: streamFromBytes(await gzipBytes(jsonl)),
        url: entry.jsonl_download_uri,
        contentType: 'application/gzip',
      });
    });

    const base = 3_000_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);
    try {
      await getLegendaryCreatures();

      // The index now fails and the cache window has expired.
      global.fetch.mockImplementation(async (url) => {
        if (String(url).includes('/bulk-data')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        return mockResponse({});
      });
      nowSpy.mockReturnValue(base + SUBSET_TTL_MS + 1);

      const subset = await getLegendaryCreatures();
      expect(subset.cards.map((c) => c.name)).toEqual(['Offline Legend']);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('downloadFilteredBulkCards applies the predicate', async () => {
    const entry = {
      type: 'oracle_cards',
      updated_at: '2026-09-12T21:05:31.691+00:00',
      jsonl_download_uri: 'https://data.scryfall.io/oracle-cards/cards.jsonl.gz',
    };
    const jsonl = [
      makeCard({ name: 'Keep Me' }),
      makeCard({ name: 'Drop Me', type_line: 'Creature — Elf' }),
    ]
      .map((c) => JSON.stringify(c))
      .join('\n');

    global.fetch.mockResolvedValueOnce(
      mockResponse({
        body: streamFromBytes(await gzipBytes(jsonl)),
        url: entry.jsonl_download_uri,
        contentType: 'application/gzip',
      })
    );

    const { cards } = await downloadFilteredBulkCards('oracle_cards', isLegendaryCreature, {
      entry,
    });
    expect(cards.map((c) => c.name)).toEqual(['Keep Me']);
  });

  it('loadBulkIndex memoises the index request', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

    await loadBulkIndex();
    await loadBulkIndex();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('verifyBulkCoverage accepts a complete subset', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' })];
    const result = verifyBulkCoverage(cards, { expectedCount: 2, sampleIds: ['a', 'b'] });

    expect(result).toEqual({
      ok: true,
      count: 2,
      expectedCount: 2,
      countMatches: true,
      missingSampleIds: [],
    });
  });

  it('verifyBulkCoverage flags missing sample ids or a count mismatch', () => {
    const cards = [makeCard({ id: 'a' })];

    expect(verifyBulkCoverage(cards, { sampleIds: ['a', 'missing'] })).toMatchObject({
      ok: false,
      missingSampleIds: ['missing'],
    });
    expect(verifyBulkCoverage(cards, { expectedCount: 2 })).toMatchObject({
      ok: false,
      countMatches: false,
    });
    // No expectations provided means anything passes.
    expect(verifyBulkCoverage(cards, {})).toMatchObject({ ok: true });
  });
});
