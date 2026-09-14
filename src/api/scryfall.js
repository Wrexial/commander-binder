// scryfall.js
import { CARDS_PER_PAGE, PAGES_PER_BINDER } from '../config/constants.js';
import { appState } from '../state/appState.js';
import { showLoading, hideLoading } from '../ui/loadingIndicator.js';
import { startNewBinder, startNewSection, updateBinderCounts } from '../ui/layout.js';
import {
  createCardElement,
  updateCardState,
  updateAllCardStates,
  updateCardVersionCounts,
} from '../ui/cards.js';
import { cardStore, primaryName } from '../state/cardStore.js';
import { updateOwnedCounter } from '../ui/components/ownedCounter.js';
import { showToast } from '../ui/components/toast.js';
import { readCache, writeCache, isFresh } from './responseCache.js';

/**
 * When a page yields too few new unique cards to render a section, we keep
 * pulling pages within the same call. Bounded so a long run of reprint-only
 * pages can't block the main thread.
 */
const MAX_EMPTY_FETCHES_PER_CALL = 10;

/**
 * Scryfall's guidance is under 10 requests/second overall, and it is stricter
 * for /cards/search (every request this app makes is a search page). We run
 * exactly ONE request at a time and space pages at least 1s apart, which stays
 * below both limits even on a completely cold cache.
 *
 * The spacing is the primary control; the sliding window is a hard backstop in
 * case the spacing is ever tuned down. Cache hits bypass both, so warm loads
 * stay instant.
 */
const DEFAULT_REQUEST_SPACING_MS = 350;
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 8;
const RATE_LIMIT_WINDOW_MS = 1000;

/** Retry budget when Scryfall answers 429 Too Many Requests. */
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

/**
 * In-flight GETs keyed by URL. Deduplicates repeated triggers (a scroll event
 * racing the auto-load continuation) so a page is never downloaded twice.
 * @type {Map<string, Promise<object>>}
 */
const inFlight = new Map();

/** Promise for the currently executing fetchNextPage run (or null). */
let activeRun = null;

/** Set when a fetch fails so auto-loading pauses instead of retrying forever. */
let halted = false;

/**
 * Optional non-API page source. When set, the render loop pulls chunks from a
 * pre-filtered Scryfall bulk subset instead of calling the rate-limited search
 * API. `next_page` is a sentinel so the existing loop/observer keep working.
 */
let bulkPager = null;
const BULK_SOURCE_SENTINEL = 'bulk:legendary-creatures';

/**
 * Render the remaining collection from an already-filtered bulk subset. Cards
 * are served in `CARDS_PER_PAGE` chunks, so the render pipeline is unchanged.
 * @param {object[]} cards
 * @returns {boolean} whether a source was installed
 */
export function setBulkCardSource(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return false;

  let offset = 0;
  bulkPager = async () => {
    const data = cards.slice(offset, offset + CARDS_PER_PAGE);
    offset += data.length;
    const hasMore = offset < cards.length;
    return {
      data,
      has_more: hasMore,
      next_page: hasMore ? BULK_SOURCE_SENTINEL : null,
      total_cards: cards.length,
    };
  };

  // Keep the loop alive even if the API already reached its last page.
  if (!appState.nextPageUrl) appState.nextPageUrl = BULK_SOURCE_SENTINEL;
  return true;
}

/** Drop the bulk source (falling back to the API, or in tests). */
export function clearBulkCardSource() {
  bulkPager = null;
}

/** Current spacing between network requests; overridable for tests/tuning. */
let requestSpacingMs = DEFAULT_REQUEST_SPACING_MS;
/** Max real network requests allowed within a rolling {@link rateLimitWindowMs}. */
let maxRequestsPerWindow = DEFAULT_MAX_REQUESTS_PER_WINDOW;
/** Sliding-window length in milliseconds. */
let rateLimitWindowMs = RATE_LIMIT_WINDOW_MS;
/** Timestamp of the last request that actually hit the network. */
let lastNetworkRequestAt = 0;
/** Start timestamps of recent network requests, oldest first. */
const recentRequestStarts = [];
/** Tail of the serialized network queue. */
let networkQueue = Promise.resolve();

/**
 * Override the network throttle. Production uses the defaults; tests call this
 * to run without real-world delays (`maxRequests: 0` disables the window cap).
 * @param {{spacingMs?: number, maxRequests?: number, windowMs?: number}} [config]
 */
export function setRequestThrottle({
  spacingMs = DEFAULT_REQUEST_SPACING_MS,
  maxRequests = DEFAULT_MAX_REQUESTS_PER_WINDOW,
  windowMs = RATE_LIMIT_WINDOW_MS,
} = {}) {
  requestSpacingMs = Math.max(0, Number(spacingMs) || 0);
  maxRequestsPerWindow = Math.max(0, Math.floor(Number(maxRequests) || 0));
  rateLimitWindowMs = Math.max(1, Number(windowMs) || RATE_LIMIT_WINDOW_MS);
  // Reconfiguring starts a fresh window so the next request fires immediately
  // instead of inheriting the previous pacing.
  lastNetworkRequestAt = 0;
  recentRequestStarts.length = 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Block until both the inter-request gap and the sliding-window rate limit
 * allow another network request to start.
 */
async function waitForRequestSlot() {
  for (;;) {
    const now = Date.now();
    while (recentRequestStarts.length > 0 && now - recentRequestStarts[0] >= rateLimitWindowMs) {
      recentRequestStarts.shift();
    }

    const spacingWait = requestSpacingMs - (now - lastNetworkRequestAt);
    if (spacingWait > 0) {
      await sleep(spacingWait);
      continue;
    }

    if (maxRequestsPerWindow > 0 && recentRequestStarts.length >= maxRequestsPerWindow) {
      // Wait until the oldest request drops out of the rolling window.
      const windowWait = rateLimitWindowMs - (now - recentRequestStarts[0]);
      await sleep(windowWait > 0 ? windowWait : 1);
      continue;
    }

    return;
  }
}

/**
 * Run a network request through a serialized queue that enforces both the
 * inter-request gap and the Scryfall rate limit. Cache hits never reach this,
 * so only cold loads are slowed. Each queued task settles on its own, so one
 * failure can't poison the queue.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function scheduleNetworkRequest(task) {
  const run = networkQueue.then(async () => {
    await waitForRequestSlot();
    lastNetworkRequestAt = Date.now();
    recentRequestStarts.push(lastNetworkRequestAt);
    return task();
  });
  networkQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Parse a Retry-After header (delta-seconds or HTTP date) into milliseconds. */
function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/**
 * Perform a fetch, backing off and retrying when Scryfall rate limits us.
 * Runs inside the throttle gate, so a backoff also pauses the rest of the queue.
 */
async function requestFromNetwork(url, options) {
  for (let attempt = 0; ; attempt++) {
    const res = options ? await fetch(url, options) : await fetch(url);
    if (res.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) return res;

    let retryAfter = null;
    try {
      retryAfter = parseRetryAfter(res.headers?.get?.('retry-after'));
    } catch {
      retryAfter = null;
    }
    await sleep(retryAfter ?? RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt);
  }
}

async function fetchScryfallData(url) {
  // Serve from cache when the record is still within Scryfall's 16h window.
  const cached = await readCache(url);
  if (isFresh(cached)) {
    return cached.data;
  }

  // Coalesce concurrent requests for the same URL.
  const pending = inFlight.get(url);
  if (pending) return pending;

  const request = scheduleNetworkRequest(async () => {
    // Revalidate an expired record with its ETag to avoid re-downloading ~880KB.
    const res = cached?.etag
      ? await requestFromNetwork(url, { headers: { 'If-None-Match': cached.etag } })
      : await requestFromNetwork(url);

    if (res.status === 304 && cached) {
      await writeCache(url, cached.data, cached.etag);
      return cached.data;
    }
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    let etag = null;
    try {
      etag = res.headers?.get?.('etag') ?? null;
    } catch {
      etag = null;
    }
    await writeCache(url, data, etag);
    return data;
  });

  inFlight.set(url, request);
  try {
    return await request;
  } finally {
    inFlight.delete(url);
  }
}

function processScryfallData(data) {
  const newUniqueCards = [];
  for (const card of data.data) {
    if (!card.games.includes('paper')) continue;

    const name = primaryName(card);
    const isNewUniqueCard = !appState.seenNames.has(name);

    cardStore.add(card);

    if (isNewUniqueCard) {
      appState.seenNames.add(name);
      // Default to the card's base (oldest) printing so the thumbnail
      // and its price line up, whatever order the source delivered.
      newUniqueCards.push(cardStore.getOldestPrinting(name) || card);
    }
    appState.seenSetCodes.add(card.set.toLowerCase());
  }
  return newUniqueCards;
}

/**
 * Fetch the next page(s) and render any complete sections.
 *
 * Re-entrant-safe: calling it while a run is in flight marks the work as
 * pending, and it is automatically re-run when the current run finishes. This
 * is what makes "scroll to the bottom during a fetch" reliable.
 *
 * @returns {Promise<void>} resolves when this run (or the in-flight one) finishes
 */
export function fetchNextPage(results, tooltip) {
  if (activeRun) {
    appState.pendingFetch = true;
    return activeRun;
  }
  if (!appState.nextPageUrl) return Promise.resolve();

  activeRun = runFetch(results, tooltip).finally(() => {
    activeRun = null;

    // Keep loading everything by default (collections must be complete),
    // or immediately when another trigger arrived mid-run.
    const shouldContinue =
      appState.nextPageUrl && !halted && (appState.pendingFetch || appState.autoLoad);
    appState.pendingFetch = false;

    if (shouldContinue) {
      // Yield so the browser can paint/handle input between pages.
      setTimeout(() => fetchNextPage(results, tooltip), 0);
    }
  });

  return activeRun;
}

async function runFetch(results, tooltip) {
  if (!appState.nextPageUrl) return;

  halted = false;
  appState.isLoading = true;
  showLoading();

  try {
    let emptyFetches = 0;

    while (appState.nextPageUrl) {
      const data = bulkPager ? await bulkPager() : await fetchScryfallData(appState.nextPageUrl);

      // Remember the API's claimed total and a sample of ids from the
      // first page so the bulk subset can be sanity-checked against them.
      if (!bulkPager) {
        if (appState.apiTotalCards == null && data.total_cards != null) {
          appState.apiTotalCards = Number(data.total_cards) || null;
        }
        if (appState.apiSampleIds == null && Array.isArray(data.data)) {
          appState.apiSampleIds = data.data.map((c) => c.id);
        }
      }

      const newCards = processScryfallData(data);
      appState.pageCards.push(...newCards);

      let renderedSections = 0;
      while (appState.pageCards.length >= CARDS_PER_PAGE) {
        renderPage(results, tooltip, appState.pageCards.splice(0, CARDS_PER_PAGE));
        renderedSections++;
      }

      appState.nextPageUrl = data.has_more ? data.next_page : null;

      if (!appState.nextPageUrl && appState.pageCards.length > 0) {
        renderPage(results, tooltip, [...appState.pageCards]);
        appState.pageCards = [];
      }

      // Rendered visible content; return to the caller/observer.
      if (renderedSections > 0) break;

      // Page was all duplicates; keep topping up, but bounded.
      if (++emptyFetches >= MAX_EMPTY_FETCHES_PER_CALL) {
        appState.pendingFetch = true;
        break;
      }
    }

    // Every printing is now loaded, so re-evaluate saved marks: a card may
    // have been marked on a printing other than the one first rendered.
    if (!appState.nextPageUrl) {
      updateAllCardStates();
      updateCardVersionCounts();
    }
  } catch (err) {
    console.error('Scryfall fetch failed:', err);
    showToast('Failed to fetch cards from Scryfall. Please try again later.', 'error');
    halted = true;
    appState.pendingFetch = false;
  } finally {
    appState.isLoading = false;
    hideLoading();
  }
}

function renderPage(results, tooltip, pageCards) {
  const pageSets = new Map();
  pageCards.forEach((c) =>
    pageSets.set(c.set, {
      name: c.set_name,
      date: c.released_at,
    })
  );

  startNewSection(pageSets);
  // Build the page off-document, then attach it in a single mutation: one
  // reflow per page instead of one per card.
  const fragment = document.createDocumentFragment();
  pageCards.forEach((c, i) => {
    const cardIndex = appState.count + i;
    const el = createCardElement(c, cardIndex);
    el.dataset.cardIndex = cardIndex;
    updateCardState(el);
    appState.binder.totalCards++;
    if (el.classList.contains('owned')) appState.binder.ownedCards++;
    fragment.appendChild(el);
  });
  appState.grid.appendChild(fragment);
  updateBinderCounts(appState.binder);

  const dates = Array.from(pageSets.values()).map((set) => set.date);
  const minDate = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  const maxDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);

  if (!appState.binder.startDate || minDate < appState.binder.startDate) {
    appState.binder.startDate = minDate;
  }
  if (!appState.binder.endDate || maxDate > appState.binder.endDate) {
    appState.binder.endDate = maxDate;
  }

  updateBinderHeader();

  appState.count += pageCards.length;
  updateOwnedCounter();

  if (appState.count % (CARDS_PER_PAGE * PAGES_PER_BINDER) === 0) {
    startNewBinder(results);
  }
}

function updateBinderHeader() {
  const header = appState.binder.querySelector('.binder-header');
  if (!header) return;

  const binderNumber = Math.floor(appState.count / (CARDS_PER_PAGE * PAGES_PER_BINDER)) + 1;
  const titleEl = header.querySelector('.binder-title');
  if (titleEl) {
    titleEl.textContent = `Binder ${binderNumber}`;
  }

  if (appState.binder.startDate && appState.binder.endDate) {
    const startYear = new Date(appState.binder.startDate).getFullYear();
    const endYear = new Date(appState.binder.endDate).getFullYear();
    const datesEl = header.querySelector('.binder-dates');
    if (datesEl) {
      datesEl.textContent = `(${startYear} - ${endYear})`;
    }
  }
}
