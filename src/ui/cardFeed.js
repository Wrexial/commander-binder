// src/ui/cardFeed.js
/**
 * Pagination and rendering orchestration for the card grid. It pulls pages
 * from the pure Scryfall fetcher (`src/api/scryfall.js`) and turns them into
 * binder/section DOM. Keeping this here means the API layer never has to know
 * about the DOM.
 */
import { CARDS_PER_PAGE, PAGES_PER_BINDER } from '../config/constants.js';
import { appState } from '../state/appState.js';
import { cardStore, primaryName } from '../state/cardStore.js';
import { fetchPage, isUsingBulkSource } from '../api/scryfall.js';
import { showLoading, hideLoading } from './loadingIndicator.js';
import { startNewBinder, startNewSection, updateBinderCounts } from './layout.js';
import {
  createCardElement,
  updateCardState,
  updateAllCardStates,
  updateCardVersionCounts,
} from './cards.js';
import { updateOwnedCounter } from './components/ownedCounter.js';
import { showToast } from './components/toast.js';
import { reapplySearchFilter } from './search.js';
import { filters } from '../state/filters.js';
import { isDefaultSort, sortCards, sortMark } from '../utils/sortCards.js';

/**
 * When a page yields too few new unique cards to render a section, we keep
 * pulling pages within the same call. Bounded so a long run of reprint-only
 * pages can't block the main thread.
 */
const MAX_EMPTY_FETCHES_PER_CALL = 10;

/** Promise for the currently executing fetchNextPage run (or null). */
let activeRun = null;

/** Set when a fetch fails so auto-loading pauses instead of retrying forever. */
let halted = false;

/**
 * True while a non-default sort is active. Those orders can't be streamed, so
 * the feed keeps loading into `cardStore` but stops appending to the DOM; the
 * grid is rebuilt when loading finishes and whenever the sort changes.
 */
let streamRenderPaused = false;

/** True while `renderCollection` rebuilds, so per-page re-filters are skipped. */
let rebuilding = false;

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
      const usingBulk = isUsingBulkSource();
      const data = await fetchPage(appState.nextPageUrl);

      // Remember the API's claimed total and a sample of ids from the
      // first page so the bulk subset can be sanity-checked against them.
      if (!usingBulk) {
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
      if (streamRenderPaused) {
        // A sorted order can't be streamed: collect only, yield per page so the
        // browser stays responsive, and rebuild the grid once loading finishes.
        appState.pageCards = [];
        appState.nextPageUrl = data.has_more ? data.next_page : null;
        renderedSections = 1;
      } else {
        while (appState.pageCards.length >= CARDS_PER_PAGE) {
          renderPage(results, tooltip, appState.pageCards.splice(0, CARDS_PER_PAGE));
          renderedSections++;
        }

        appState.nextPageUrl = data.has_more ? data.next_page : null;

        if (!appState.nextPageUrl && appState.pageCards.length > 0) {
          renderPage(results, tooltip, [...appState.pageCards]);
          appState.pageCards = [];
        }
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
      // Finish a sorted rebuild now that the whole collection is in the store.
      if (!isDefaultSort(filters.sort)) renderCollection(results);
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
  const chronological = isDefaultSort(filters.sort);

  const pageSets = new Map();
  pageCards.forEach((c) =>
    pageSets.set(c.set, {
      name: c.set_name,
      date: c.released_at,
    })
  );

  startNewSection(pageSets, { showSets: chronological });

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

  if (chronological) {
    const dates = Array.from(pageSets.values()).map((set) => set.date);
    const minDate = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
    const maxDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);

    // Scrubber metadata: the page's release year and the sets it holds.
    if (appState.section) {
      appState.section.dataset.mark = String(new Date(minDate).getFullYear());
      appState.section.dataset.markSets = Array.from(pageSets.keys())
        .map((code) => code.toUpperCase())
        .join(', ');
    }

    if (!appState.binder.startDate || minDate < appState.binder.startDate) {
      appState.binder.startDate = minDate;
    }
    if (!appState.binder.endDate || maxDate > appState.binder.endDate) {
      appState.binder.endDate = maxDate;
    }
  } else if (appState.section) {
    // Sorted grid: the scrubber mark follows the sort key instead of the year.
    appState.section.dataset.mark = sortMark(pageCards[0], filters.sort);
    appState.section.dataset.markSets = '';
  }

  updateBinderHeader();

  appState.count += pageCards.length;
  if (!rebuilding) {
    reapplySearchFilter();
    updateOwnedCounter();
  }

  if (appState.count % (CARDS_PER_PAGE * PAGES_PER_BINDER) === 0) {
    startNewBinder(results);
  }
}

/**
 * Rebuild the whole grid from the loaded collection in the active sort order.
 * Used for every non-chronological sort, and when switching back to the
 * default order after the feed stopped streaming.
 */
function renderCollection(results) {
  const ordered = sortCards(cardStore.getAll(), filters.sort);

  // Drop the old binders but keep the infinite-scroll sentinel, if present.
  results.querySelectorAll('.binder').forEach((binder) => binder.remove());
  appState.pageCards = [];
  appState.count = 0;
  appState.binder = null;
  appState.section = null;

  startNewBinder(results);

  rebuilding = true;
  try {
    for (let i = 0; i < ordered.length; i += CARDS_PER_PAGE) {
      renderPage(results, null, ordered.slice(i, i + CARDS_PER_PAGE));
    }
  } finally {
    rebuilding = false;
  }

  reapplySearchFilter();
  updateOwnedCounter();

  // The whole order changed, so a restored scroll offset is now meaningless.
  window.scrollTo(0, 0);
}

/**
 * Re-render the grid in the current `filters.sort`. Called by the filter bar
 * when the sort changes. While a non-default sort is active the streaming feed
 * stops appending and waits for the next rebuild.
 */
export function applySort() {
  streamRenderPaused = !isDefaultSort(filters.sort);
  const results = document.getElementById('results');
  if (results) renderCollection(results);
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
