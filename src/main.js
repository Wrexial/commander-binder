// main.js
import { bootShell } from './app/shell.js';
import { initLazyCards } from './ui/lazyCardLoader.js';
import { applySort } from './ui/cardFeed.js';
import { initSearch, refreshCardFilter } from './ui/search.js';
import { initFilterBar } from './ui/filterBar.js';
import { initCardInteractions } from './ui/cardInteractions.js';
import { initKeyboardShortcuts } from './ui/keyboardShortcuts.js';
import { initBulkEdit } from './ui/bulkEdit.js';
import { initScrollPosition } from './ui/scrollPosition.js';
import { initYearScrubber } from './ui/yearScrubber.js';
import { initViewportMetrics } from './utils/viewport.js';
import { updateAllBinderCounts } from './ui/layout.js';
import { addButtonToSidebar } from './ui/components/sidebar.js';
import { startFirstRunTour } from './ui/components/tour.js';
import { isTourDone } from './state/onboarding.js';

// setupUI stays importable from here for the existing tests/bootstrap callers.
export { setupUI } from './app/shell.js';

/** The binder builder is a separate page; this is the link that reaches it. */
function addBinderBuilderLink() {
  addButtonToSidebar(
    '🗂️ Binder Builder',
    () => {
      // Preserve `?share=` so a share visitor stays in the owner's view.
      window.location.href = `binder.html${window.location.search}`;
    },
    'browse',
    5
  );
}

/** Replay entry point, always available from the sidebar. */
function addTourLink() {
  addButtonToSidebar('❓ App Tour', () => startFirstRunTour({ force: true }), 'settings', 20);
}

/**
 * Auto-run the tour on a first visit, once the grid has a card to point at.
 * Guests still looking at the welcome panel get their own tour button instead
 * of a second overlay on top of it.
 */
function scheduleFirstRunTour() {
  if (isTourDone()) return;
  // Guests still looking at the welcome panel get their own tour button instead
  // of a second overlay on top of it; a share-link visitor is not the owner and
  // has none of the tools the tour describes.
  if (document.querySelector('.guest-welcome, .guest-mode-container')) return;

  const waitForCard = (attempt = 0) => {
    if (document.querySelector('#results .card') || attempt >= 20) {
      startFirstRunTour();
      return;
    }
    window.setTimeout(() => waitForCard(attempt + 1), 250);
  };
  window.setTimeout(waitForCard, 500);
}

document.addEventListener('DOMContentLoaded', async () => {
  const { results, tooltip, shellReady } = await bootShell();

  // Mount the browser immediately: it reads Scryfall data and does not need
  // Clerk, so it should not wait for the auth bundle to load.
  initScrollPosition();
  initLazyCards(results, tooltip);
  initYearScrubber();
  updateAllBinderCounts();
  initViewportMetrics();
  initSearch();
  initFilterBar({ onChange: refreshCardFilter, onSortChange: applySort });
  initCardInteractions(results, tooltip);
  initBulkEdit();
  initKeyboardShortcuts();

  // The guest welcome's "Take a quick tour" button, and any future entry point
  // that does not want to import the tour module directly.
  document.addEventListener('tour:start', () => startFirstRunTour({ force: true }));

  // The sidebar is (re)built by setupUI, so page-specific links are added once
  // the shell has finished setting it up.
  await shellReady;
  addBinderBuilderLink();
  addTourLink();
  scheduleFirstRunTour();
});
