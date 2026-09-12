// scryfall.js
import { CARDS_PER_PAGE, PAGES_PER_BINDER } from '../config/constants.js';
import { appState } from '../state/appState.js';
import { showLoading, hideLoading } from '../ui/loadingIndicator.js';
import { startNewBinder, startNewSection, updateBinderCounts } from '../ui/layout.js';
import { createCardElement, updateCardState, updateAllCardStates } from '../ui/cards.js';
import { cardStore } from '../state/cardStore.js';
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
 * Parallelism for cache-warming. This only governs how many pages are queued
 * at once; actual network requests are paced by the global throttle below.
 */
const PREFETCH_CONCURRENCY = 4;

/**
 * Minimum spacing between real network requests to Scryfall (ms). Cache hits
 * bypass this entirely, so warm loads stay instant. Scryfall asks clients to
 * stay under ~10 req/s and to avoid concurrent requests; a cold collection can
 * span hundreds of large search pages, so blasting the prefetch pool gets us
 * rate limited (429). At 150ms we sit around 6-7 req/s even when nothing is
 * cached.
 */
const DEFAULT_REQUEST_SPACING_MS = 150;

/** Retry budget when Scryfall answers 429 Too Many Requests. */
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

/**
 * In-flight GETs keyed by URL. Deduplicates the background prefetch and the
 * sequential render loop so a page is never downloaded twice.
 * @type {Map<string, Promise<object>>}
 */
const inFlight = new Map();

/** Promise for the currently executing fetchNextPage run (or null). */
let activeRun = null;

/** Set when a fetch fails so auto-loading pauses instead of retrying forever. */
let halted = false;

/** Current spacing between network requests; overridable for tests/tuning. */
let requestSpacingMs = DEFAULT_REQUEST_SPACING_MS;
/** Timestamp of the last request that actually hit the network. */
let lastNetworkRequestAt = 0;
/** Tail of the serialized network queue. */
let networkQueue = Promise.resolve();

/**
 * Override the minimum spacing between real network requests.
 * @param {number} ms Spacing in milliseconds (0 disables pacing).
 */
export function setRequestSpacing(ms) {
    requestSpacingMs = Math.max(0, Number(ms) || 0);
    // Reconfiguring the pacing starts a fresh window so the next request fires
    // immediately instead of inheriting the previous spacing.
    lastNetworkRequestAt = 0;
}

function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a network request through a serialized queue that enforces a minimum gap
 * between requests. Cache hits never reach this, so only cold loads are slowed.
 * Each queued task settles on its own, so one failure can't poison the queue.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function scheduleNetworkRequest(task) {
    const run = networkQueue.then(async () => {
        const wait = requestSpacingMs - (Date.now() - lastNetworkRequestAt);
        if (wait > 0) await sleep(wait);
        lastNetworkRequestAt = Date.now();
        return task();
    });
    networkQueue = run.then(() => undefined, () => undefined);
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
        if (!card.games.includes("paper")) continue;
        
        const primaryName = card.name.split(' // ')[0];
        const isNewUniqueCard = !appState.seenNames.has(primaryName);

        cardStore.add(card);

        if (isNewUniqueCard) {
            appState.seenNames.add(primaryName);
            newUniqueCards.push(card);
        }
        appState.seenSetCodes.add(card.set.toLowerCase());
    }
    return newUniqueCards;
}

/**
 * Derive the `page=N` URLs for every page after the first. Scryfall's
 * `next_page` link is normalised and contains `page=2`, so substituting the
 * page number yields exactly the URLs the sequential render loop will use.
 */
function derivePageUrls(nextPageUrl, totalPages) {
    const pageParam = /([?&]page=)\d+/;
    if (!nextPageUrl || !pageParam.test(nextPageUrl)) return [];

    const urls = [];
    for (let page = 2; page <= totalPages; page++) {
        urls.push(nextPageUrl.replace(pageParam, `$1${page}`));
    }
    return urls;
}

async function runPool(items, limit, worker) {
    let index = 0;
    const runners = [];
    for (let i = 0; i < Math.min(limit, items.length); i++) {
        runners.push((async () => {
            while (index < items.length) {
                const item = items[index++];
                try {
                    await worker(item);
                } catch {
                    /* prefetch is best-effort; the render loop will retry */
                }
                await yieldToBrowser();
            }
        })());
    }
    await Promise.all(runners);
}

/**
 * Warm the cache for every remaining page in parallel. Rendering stays strictly
 * sequential (to preserve release order), but each page is usually already
 * cached by the time the render loop reaches it.
 */
function startPrefetch(firstPage) {
    if (appState.prefetchStarted) return;
    appState.prefetchStarted = true;

    const perPage = firstPage.data?.length || CARDS_PER_PAGE;
    const totalCards = Number(firstPage.total_cards) || 0;
    const totalPages = Math.ceil(totalCards / perPage);
    if (totalPages <= 1) return;

    const urls = derivePageUrls(firstPage.next_page, totalPages);
    if (urls.length === 0) return;

    runPool(urls, PREFETCH_CONCURRENCY, (url) => fetchScryfallData(url));
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
            const data = await fetchScryfallData(appState.nextPageUrl);

            if (!appState.prefetchStarted && data.has_more) {
                startPrefetch(data);
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
        }
    } catch (err) {
        console.error("Scryfall fetch failed:", err);
        showToast("Failed to fetch cards from Scryfall. Please try again later.", "error");
        halted = true;
        appState.pendingFetch = false;
    } finally {
        appState.isLoading = false;
        hideLoading();
    }
}

function renderPage(results, tooltip, pageCards) {
    const pageSets = new Map();
    pageCards.forEach(c => pageSets.set(c.set, {
        name: c.set_name,
        date: c.released_at
    }));

    startNewSection(pageSets);
    pageCards.forEach((c, i) => {
        const cardIndex = appState.count + i;
        const el = createCardElement(c, cardIndex);
        el.dataset.cardIndex = cardIndex;
        appState.grid.appendChild(el);
        updateCardState(el);
        appState.binder.totalCards++;
        if (el.classList.contains('owned')) appState.binder.ownedCards++;
    });
    updateBinderCounts(appState.binder);

    const dates = Array.from(pageSets.values()).map(set => set.date);
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
    const header = appState.binder.querySelector(".binder-header");
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
