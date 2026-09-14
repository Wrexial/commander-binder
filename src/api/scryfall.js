// src/api/scryfall.js
/**
 * Pure Scryfall search-page fetcher: response caching, request pacing and
 * rate-limit backoff. It has no UI or render-loop knowledge, so it can be used
 * (and tested) on its own. Pagination and rendering live in
 * `src/ui/cardFeed.js`.
 */
import { CARDS_PER_PAGE } from '../config/constants.js';
import { readCache, writeCache, isFresh } from './responseCache.js';

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

/**
 * Optional non-API page source. When set, the render loop pulls chunks from a
 * pre-filtered Scryfall bulk subset instead of calling the rate-limited search
 * API. `next_page` is a sentinel so the existing loop/observer keep working.
 */
let bulkPager = null;
export const BULK_SOURCE_SENTINEL = 'bulk:legendary-creatures';

/**
 * Serve pages from an already-filtered bulk subset instead of the API. Cards
 * are returned in `CARDS_PER_PAGE` chunks so the render pipeline is unchanged.
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

  return true;
}

/** Drop the bulk source (falling back to the API, or in tests). */
export function clearBulkCardSource() {
  bulkPager = null;
}

/** True when pages are currently being served from an installed bulk subset. */
export function isUsingBulkSource() {
  return Boolean(bulkPager);
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

/**
 * Fetch one page from whichever source is active (an installed bulk subset or
 * the rate-limited search API).
 * @param {string} url Next-page URL (ignored by the bulk source).
 * @returns {Promise<object>}
 */
export async function fetchPage(url) {
  return bulkPager ? bulkPager() : fetchScryfallData(url);
}
