import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolate the fetcher from DOM-heavy UI modules so it can be tested directly.
vi.mock('../../ui/loadingIndicator.js', () => ({
  showLoading: vi.fn(),
  hideLoading: vi.fn(),
}));
vi.mock('../../ui/layout.js', () => ({
  startNewBinder: vi.fn(),
  startNewSection: vi.fn(),
  updateBinderCounts: vi.fn(),
}));
vi.mock('../../ui/cards.js', () => ({
  createCardElement: vi.fn(() => {
    const el = document.createElement('div');
    el.className = 'card';
    return el;
  }),
  updateCardState: vi.fn(),
  updateAllCardStates: vi.fn(),
}));
vi.mock('../../state/cardStore.js', () => ({
  cardStore: {
    add: vi.fn(),
    getPrintings: vi.fn(() => []),
    getAll: vi.fn(() => []),
    clear: vi.fn(),
  },
}));
vi.mock('../../ui/components/ownedCounter.js', () => ({
  updateOwnedCounter: vi.fn(),
}));
vi.mock('../../ui/components/toast.js', () => ({
  showToast: vi.fn(),
}));

import { fetchNextPage, setRequestThrottle } from '../scryfall.js';
import { appState } from '../../state/appState.js';
import { clearCache, writeCache, CACHE_TTL_MS } from '../responseCache.js';
import * as layout from '../../ui/layout.js';
import * as cards from '../../ui/cards.js';
import { showToast } from '../../ui/components/toast.js';

const START_URL = 'https://api.scryfall.com/cards/search?page=1';
const PAGE_2 = 'https://api.scryfall.com/cards/search?dir=asc&order=released&page=2&q=x&unique=prints';
const PAGE_3 = 'https://api.scryfall.com/cards/search?dir=asc&order=released&page=3&q=x&unique=prints';

function makeCards(count, prefix = 'Card') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    name: `${prefix} ${i}`,
    set: 'tst',
    set_name: 'Test Set',
    released_at: '2024-01-01',
    games: ['paper'],
  }));
}

function jsonResponse(body, { etag = null, retryAfter = null, status = 200, ok = true } = {}) {
  return {
    ok,
    status,
    headers: {
      get: (name) => {
        const key = name.toLowerCase();
        if (key === 'etag') return etag;
        if (key === 'retry-after') return retryAfter;
        return null;
      },
    },
    json: async () => body,
  };
}

describe('fetchNextPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearCache();

    // Tests exercise behavior, not real-world pacing. Disable both the spacing
    // and the sliding-window cap so requests resolve immediately (and fake
    // timers don't deadlock).
    setRequestThrottle({ spacingMs: 0, maxRequests: 0 });

    global.fetch = vi.fn();
    appState.nextPageUrl = START_URL;
    appState.isLoading = false;
    appState.pendingFetch = false;
    appState.autoLoad = false;
    appState.seenNames = new Set();
    appState.seenSetCodes = new Set();
    appState.pageCards = [];
    appState.count = 0;
    appState.binder = document.createElement('div');
    appState.binder.totalCards = 0;
    appState.binder.ownedCards = 0;
    appState.grid = document.createElement('div');
  });

  it('fetches only one page when the first page already fills a section', async () => {
    // 175 unique names => 8 full sections (160 cards) + 15 buffered.
    global.fetch.mockResolvedValue(
      jsonResponse({ has_more: true, next_page: PAGE_2, data: makeCards(175) })
    );

    await fetchNextPage(null, null);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(START_URL);
    expect(appState.nextPageUrl).toBe(PAGE_2);
    expect(cards.createCardElement).toHaveBeenCalledTimes(160);
    expect(appState.pageCards).toHaveLength(15);
    expect(layout.startNewSection).toHaveBeenCalledTimes(8);
    expect(appState.isLoading).toBe(false);
  });

  it('keeps fetching while pages yield too few new cards, then stops', async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({ has_more: true, next_page: PAGE_2, data: makeCards(5, 'A') })
      )
      .mockResolvedValueOnce(
        jsonResponse({ has_more: true, next_page: PAGE_3, data: makeCards(20, 'B') })
      );

    await fetchNextPage(null, null);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(appState.nextPageUrl).toBe(PAGE_3);
    expect(cards.createCardElement).toHaveBeenCalledTimes(20);
  });

  it('flushes a partial final page when results end', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ has_more: false, next_page: null, data: makeCards(3) })
    );

    await fetchNextPage(null, null);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(appState.nextPageUrl).toBeNull();
    expect(cards.createCardElement).toHaveBeenCalledTimes(3);
    expect(appState.pageCards).toHaveLength(0);
  });

  it('serves a repeated request from cache without hitting the network', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ has_more: true, next_page: PAGE_2, data: makeCards(175) }, { etag: 'e1' })
    );

    await fetchNextPage(null, null);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Simulate a fresh page load re-requesting the same first URL.
    appState.nextPageUrl = START_URL;
    appState.seenNames = new Set();
    appState.seenSetCodes = new Set();
    appState.pageCards = [];
    appState.count = 0;
    appState.isLoading = false;

    await fetchNextPage(null, null);

    expect(global.fetch).toHaveBeenCalledTimes(1); // cache hit, no second call
  });

  it('revalidates a stale entry with If-None-Match and reuses the body on 304', async () => {
    await writeCache(
      START_URL,
      { has_more: false, next_page: null, data: makeCards(3) },
      'etag-old',
      Date.now() - CACHE_TTL_MS - 1000 // expired
    );
    global.fetch.mockResolvedValue(jsonResponse({}, { status: 304, ok: false }));

    await fetchNextPage(null, null);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(START_URL, {
      headers: { 'If-None-Match': 'etag-old' },
    });
    expect(cards.createCardElement).toHaveBeenCalledTimes(3);
  });

  it('queues a follow-up when a trigger arrives while a fetch is in flight', async () => {
    let resolveFirst;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    global.fetch
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(jsonResponse({ has_more: false, next_page: null, data: makeCards(20, 'B') }));

    const firstRun = fetchNextPage(null, null); // starts and awaits firstResponse
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    fetchNextPage(null, null); // second trigger mid-flight (e.g. scroll to bottom)

    expect(appState.pendingFetch).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFirst(jsonResponse({ has_more: true, next_page: PAGE_2, data: makeCards(175, 'A') }));
    await firstRun;

    // The coalesced follow-up runs on the next tick.
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(appState.nextPageUrl).toBeNull();
  });

  it('auto-loads every page when autoLoad is enabled', async () => {
    appState.autoLoad = true;
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ has_more: true, next_page: PAGE_2, data: makeCards(175, 'A') }))
      .mockResolvedValueOnce(jsonResponse({ has_more: true, next_page: PAGE_3, data: makeCards(175, 'B') }))
      .mockResolvedValueOnce(jsonResponse({ has_more: false, next_page: null, data: makeCards(20, 'C') }));

    await fetchNextPage(null, null);
    await vi.waitFor(() => expect(appState.nextPageUrl).toBeNull());

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(appState.isLoading).toBe(false);
  });

  it('runs Scryfall requests one at a time (never concurrently)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const respond = (body) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight--;
          resolve(jsonResponse(body));
        }, 5);
      });
    };
    global.fetch
      .mockImplementationOnce(() => respond({ has_more: true, next_page: PAGE_2, data: [] }))
      .mockImplementationOnce(() =>
        respond({ has_more: false, next_page: null, data: makeCards(20) })
      );

    await fetchNextPage(null, null);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
  });

  it('yields and continues when a long run of pages has no new cards', async () => {
    vi.useFakeTimers();
    try {
      // 10 duplicate-only pages (the per-call cap), then a page with content.
      for (let i = 0; i < 10; i++) {
        global.fetch.mockResolvedValueOnce(
          jsonResponse({ has_more: true, next_page: `P${i + 2}`, data: [] })
        );
      }
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ has_more: false, next_page: null, data: makeCards(20, 'Z') })
      );

      await fetchNextPage(null, null);
      expect(global.fetch).toHaveBeenCalledTimes(10);

      // The scheduled continuation picks up without needing a scroll event.
      await vi.runAllTimersAsync();
      expect(global.fetch).toHaveBeenCalledTimes(11);
      expect(cards.createCardElement).toHaveBeenCalledTimes(20);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing when there is no next page url', async () => {
    appState.nextPageUrl = null;
    await fetchNextPage(null, null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handles fetch errors gracefully without a tight retry loop', async () => {
    appState.autoLoad = true;
    global.fetch.mockRejectedValue(new Error('API Error'));

    await fetchNextPage(null, null);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(showToast).toHaveBeenCalledWith(
      'Failed to fetch cards from Scryfall. Please try again later.',
      'error'
    );
    expect(global.fetch).toHaveBeenCalledTimes(1); // halted, no auto-retry
    expect(appState.isLoading).toBe(false);
  });

  it('paces cold network requests but skips the delay for cache hits', async () => {
    vi.useFakeTimers();
    try {
      setRequestThrottle({ spacingMs: 150, maxRequests: 0 });
      // An empty first page forces the loop on to PAGE_2, so one run makes two
      // sequential network requests.
      global.fetch
        .mockResolvedValueOnce(jsonResponse({ has_more: true, next_page: PAGE_2, data: [] }))
        .mockResolvedValueOnce(
          jsonResponse({ has_more: false, next_page: null, data: makeCards(20) })
        );

      const run = fetchNextPage(null, null);
      // First request fires immediately despite the spacing.
      await vi.advanceTimersByTimeAsync(0);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // The next page waits out the gap before it is requested.
      await vi.advanceTimersByTimeAsync(149);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await run;
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      setRequestThrottle({ spacingMs: 0, maxRequests: 0 });
      vi.useRealTimers();
    }
  });

  it('waits and retries once when Scryfall returns 429', async () => {
    vi.useFakeTimers();
    try {
      setRequestThrottle({ spacingMs: 0, maxRequests: 0 });
      global.fetch
        .mockResolvedValueOnce(jsonResponse({}, { status: 429, ok: false, retryAfter: '2' }))
        .mockResolvedValueOnce(
          jsonResponse({ has_more: false, next_page: null, data: makeCards(3) })
        );

      const run = fetchNextPage(null, null);
      await vi.advanceTimersByTimeAsync(1999);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await run;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(cards.createCardElement).toHaveBeenCalledTimes(3);
    } finally {
      setRequestThrottle({ spacingMs: 0, maxRequests: 0 });
      vi.useRealTimers();
    }
  });

  it('never exceeds the sliding-window request ceiling', async () => {
    // Small window keeps the test fast while proving the limiter works.
    setRequestThrottle({ spacingMs: 0, maxRequests: 2, windowMs: 100 });
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ has_more: true, next_page: PAGE_2, data: [] }))
      .mockResolvedValueOnce(jsonResponse({ has_more: true, next_page: PAGE_3, data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ has_more: false, next_page: null, data: makeCards(20) })
      );

    const startedAt = Date.now();
    await fetchNextPage(null, null);
    const elapsed = Date.now() - startedAt;

    expect(global.fetch).toHaveBeenCalledTimes(3);
    // The 3rd request had to wait for the 1st to age out of the window.
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });
});
