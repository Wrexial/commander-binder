import { appState } from '../state/appState.js';
import { fetchNextPage } from './cardFeed.js';
import { setBulkCardSource, BULK_SOURCE_SENTINEL } from '../api/scryfall.js';
import { getLegendaryCreatures, verifyBulkCoverage } from '../api/bulkData.js';
import { getSetting } from '../state/cardSettings.js';
import { startNewBinder } from './layout.js';

/**
 * Default view: every printing of a legendary creature, oldest first. The
 * first page is loaded through the (rate-limited) search API for an instant
 * paint; the rest of the collection comes from Scryfall's bulk data in a single
 * CDN request instead of ~72 search pages.
 */
const LEGENDARY_CREATURES_URL =
  'https://api.scryfall.com/cards/search?q=type:legendary type:creature&unique=prints&order=released&dir=asc';

export function initLazyCards(results, tooltip) {
  results.innerHTML = '';

  // ⚡ Create first binder immediately to avoid null errors
  startNewBinder(results);

  const ownedCountEl = appState.binder.querySelector('.owned-count');
  if (ownedCountEl) {
    ownedCountEl.textContent = `Owned: ${appState.binder.ownedCards}/${appState.binder.totalCards}`;
  }

  appState.nextPageUrl = LEGENDARY_CREATURES_URL;
  appState.apiTotalCards = null;
  appState.apiSampleIds = null;

  // Only the first page hits the API. It paints instantly and gives us the
  // expected total + a sample of ids to sanity-check the bulk subset against.
  appState.autoLoad = false;
  const firstPage = fetchNextPage(results, tooltip);

  // Infinite scroll. While bulk data loads (or if it fails) this falls back to
  // pulling the next API page on demand.
  const sentinel = document.createElement('div');
  sentinel.id = 'infinite-scroll-sentinel';
  sentinel.style.width = '100%';
  sentinel.style.height = '1px';
  results.appendChild(sentinel);

  const io = new IntersectionObserver(
    (entries) => {
      if (!appState.nextPageUrl) {
        io.disconnect();
        sentinel.remove();
        return;
      }

      if (entries[0].isIntersecting) {
        fetchNextPage(results, tooltip);
      }
    },
    { root: null, rootMargin: '1000px' }
  );

  io.observe(sentinel);

  loadFullCollectionFromBulk(results, tooltip, firstPage);
}

/**
 * Swap the API pagination for a one-shot bulk download, sanity-checking it
 * against what the search API reported. Any failure falls back to the existing
 * API pagination so the view still completes.
 */
async function loadFullCollectionFromBulk(results, tooltip, firstPage) {
  try {
    await firstPage;
  } catch {
    // The first page is best-effort; bulk data can still complete the view.
  }

  try {
    const { cards } = await getLegendaryCreatures({ buildArchive: getSetting('preloadCards') });
    // Counts differ slightly (bulk lags the live index by a daily refresh and
    // carries a few non-searchable printings), so only the id sample is a hard
    // requirement. The delta is logged below for visibility.
    const coverage = verifyBulkCoverage(cards, {
      sampleIds: appState.apiSampleIds,
    });

    if (coverage.missingSampleIds.length > 0) {
      console.warn(
        'Scryfall bulk data did not contain the first page of search results; ' +
          'falling back to the search API.',
        coverage
      );
      appState.autoLoad = true;
      fetchNextPage(results, tooltip);
      return;
    }

    if (appState.apiTotalCards != null && coverage.count !== appState.apiTotalCards) {
      console.info(
        `Scryfall bulk data has ${coverage.count} legendary creatures ` +
          `(search API reports ${appState.apiTotalCards}); using bulk data.`
      );
    }

    if (setBulkCardSource(cards)) {
      // Keep the loop alive even if the API already reached its last page.
      if (!appState.nextPageUrl) appState.nextPageUrl = BULK_SOURCE_SENTINEL;
      appState.autoLoad = true;
      fetchNextPage(results, tooltip);
    }
  } catch (err) {
    console.warn('Scryfall bulk data unavailable; falling back to the search API.', err);
    appState.autoLoad = true;
    fetchNextPage(results, tooltip);
  }
}
