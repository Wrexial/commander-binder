import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Isolate the fetcher from DOM-heavy UI modules so it can be tested directly.
vi.mock('../loadingIndicator.js', () => ({
  showLoading: vi.fn(),
  hideLoading: vi.fn(),
}));
vi.mock('../layout.js', () => ({
  startNewBinder: vi.fn(),
  startNewSection: vi.fn(),
  updateBinderCounts: vi.fn(),
}));
vi.mock('../cards.js', () => ({
  createCardElement: vi.fn(() => {
    const el = document.createElement('div');
    el.className = 'card';
    return el;
  }),
  updateCardState: vi.fn(),
  updateAllCardStates: vi.fn(),
  updateCardVersionCounts: vi.fn(),
  applyPreferredPrintings: vi.fn(),
}));
vi.mock('../../state/cardStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  cardStore: {
    add: vi.fn(),
    getPrintings: vi.fn(() => []),
    getOldestPrinting: vi.fn(() => undefined),
    getAll: vi.fn(() => []),
    clear: vi.fn(),
  },
}));
vi.mock('../components/ownedCounter.js', () => ({
  updateOwnedCounter: vi.fn(),
}));
vi.mock('../components/toast.js', () => ({
  showToast: vi.fn(),
}));

import { fetchNextPage, applySort, refreshGridLayout } from '../cardFeed.js';
import { setRequestThrottle, setBulkCardSource, clearBulkCardSource } from '../../api/scryfall.js';
import { appState } from '../../state/appState.js';
import { clearCache, writeCache, CACHE_TTL_MS } from '../../api/responseCache.js';
import * as layout from '../layout.js';
import * as cards from '../cards.js';
import { showToast } from '../components/toast.js';
import { cardStore } from '../../state/cardStore.js';
import { filters, resetFilters } from '../../state/filters.js';
import { cardSettings } from '../../state/cardSettings.js';

const START_URL = 'https://api.scryfall.com/cards/search?page=1';
const PAGE_2 =
  'https://api.scryfall.com/cards/search?dir=asc&order=released&page=2&q=x&unique=prints';
const PAGE_3 =
  'https://api.scryfall.com/cards/search?dir=asc&order=released&page=3&q=x&unique=prints';

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
    appState.apiTotalCards = null;
    appState.apiSampleIds = null;
    clearBulkCardSource();
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

  it('attaches a rendered page to the grid in a single DOM mutation', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ has_more: false, next_page: null, data: makeCards(20) })
    );

    const appendSpy = vi.spyOn(appState.grid, 'appendChild');
    await fetchNextPage(null, null);

    expect(cards.createCardElement).toHaveBeenCalledTimes(20);
    expect(appendSpy).toHaveBeenCalledTimes(1);
  });

  it('stamps each section with its release year and sets for the year scrubber', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ has_more: false, next_page: null, data: makeCards(20) })
    );

    const section = document.createElement('div');
    layout.startNewSection.mockImplementation(() => {
      appState.section = section;
    });

    await fetchNextPage(null, null);

    expect(section.dataset.mark).toBe('2024');
    expect(section.dataset.markSets).toBe('TST');
    layout.startNewSection.mockImplementation(() => {});
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
      .mockResolvedValueOnce(
        jsonResponse({ has_more: false, next_page: null, data: makeCards(20, 'B') })
      );

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
      .mockResolvedValueOnce(
        jsonResponse({ has_more: true, next_page: PAGE_2, data: makeCards(175, 'A') })
      )
      .mockResolvedValueOnce(
        jsonResponse({ has_more: true, next_page: PAGE_3, data: makeCards(175, 'B') })
      )
      .mockResolvedValueOnce(
        jsonResponse({ has_more: false, next_page: null, data: makeCards(20, 'C') })
      );

    await fetchNextPage(null, null);
    await vi.waitFor(() => expect(appState.nextPageUrl).toBeNull());

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(appState.isLoading).toBe(false);
  });

  it('captures the API total and a page-1 sample for bulk verification', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ has_more: false, next_page: null, total_cards: 999, data: makeCards(3, 'A') })
    );

    await fetchNextPage(null, null);

    expect(appState.apiTotalCards).toBe(999);
    expect(appState.apiSampleIds).toEqual(['A-0', 'A-1', 'A-2']);
  });

  it('renders the rest of the collection from a bulk source without more API calls', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ has_more: true, next_page: PAGE_2, data: makeCards(175, 'A') })
    );

    await fetchNextPage(null, null); // API page 1
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Feed a small bulk batch and let the auto-load loop finish it.
    expect(setBulkCardSource(makeCards(30, 'B'))).toBe(true);
    appState.autoLoad = true;
    await fetchNextPage(null, null);
    await vi.waitFor(() => expect(appState.nextPageUrl).toBeNull());

    // No further Scryfall requests: everything came from the bulk source.
    expect(global.fetch).toHaveBeenCalledTimes(1);
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

describe('applySort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="results"><div class="binder">old</div></div>';
  });

  afterEach(() => {
    resetFilters();
    document.body.innerHTML = '';
  });

  it('rebuilds the grid in the selected order', () => {
    const results = document.getElementById('results');

    // Give the mocked layout enough to satisfy the render loop.
    layout.startNewBinder.mockImplementation(() => {
      const binder = document.createElement('div');
      binder.className = 'binder';
      binder.totalCards = 0;
      binder.ownedCards = 0;
      appState.binder = binder;
      results.appendChild(binder);
    });
    layout.startNewSection.mockImplementation(() => {
      const section = document.createElement('div');
      section.className = 'section';
      appState.section = section;
      appState.grid = document.createElement('div');
      section.appendChild(appState.grid);
      appState.binder.appendChild(section);
    });

    cardStore.getAll.mockReturnValue([
      { id: 'b', name: 'Beta', released_at: '1995-01-01' },
      { id: 'a', name: 'Alpha', released_at: '1993-01-01' },
    ]);

    filters.sort = 'name-asc';
    applySort();

    // The stale binder is gone and the cards were created in name order.
    expect(results.querySelectorAll('.binder')).toHaveLength(1);
    expect(cards.createCardElement.mock.calls.map(([card]) => card.name)).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('paginates by the configured grid size when the layout changes', () => {
    const results = document.getElementById('results');

    layout.startNewBinder.mockImplementation(() => {
      const binder = document.createElement('div');
      binder.className = 'binder';
      binder.totalCards = 0;
      binder.ownedCards = 0;
      appState.binder = binder;
      results.appendChild(binder);
    });
    layout.startNewSection.mockImplementation(() => {
      const section = document.createElement('div');
      section.className = 'section';
      appState.section = section;
      appState.grid = document.createElement('div');
      section.appendChild(appState.grid);
      appState.binder.appendChild(section);
    });

    // 5 columns x 2 rows = 10 cards per page; 25 cards make 3 sections.
    cardSettings.gridColumns = 5;
    cardSettings.gridRows = 2;
    cardStore.getAll.mockReturnValue(
      Array.from({ length: 25 }, (_, i) => ({
        id: `c${i}`,
        name: `Card ${i}`,
        set: 'tst',
        set_name: 'Test Set',
        released_at: '2024-01-01',
      }))
    );

    refreshGridLayout();

    expect(cards.createCardElement).toHaveBeenCalledTimes(25);
    expect(layout.startNewSection).toHaveBeenCalledTimes(3);

    // Restore the defaults for the rest of the suite.
    cardSettings.gridColumns = 5;
    cardSettings.gridRows = 4;
  });
});
