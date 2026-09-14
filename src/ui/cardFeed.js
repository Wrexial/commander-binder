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
