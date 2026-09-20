// src/binderMain.js
/**
 * Entry point for the Binder Builder page (`binder.html`).
 *
 * Reuses the shared app shell (auth, sidebar, collection/wishlist/lists,
 * settings) and replaces the browse grid with the binder editor. The picker
 * searches Scryfall live and the editor hydrates only the pockets it renders
 * (see `api/cardSearch.js`), so the page does not block on a card download.
 * The legendary-creature set is still warmed in the background afterwards,
 * because Statistics and Compare Collections label the collection from
 * `cardStore`.
 */
import { bootShell } from './app/shell.js';
import { initBinderBuilder } from './ui/binderBuilder.js';
import { initCardInteractions } from './ui/cardInteractions.js';
import { initViewportMetrics } from './utils/viewport.js';
import { addButtonToSidebar } from './ui/components/sidebar.js';
import { startFirstRunTour } from './ui/components/tour.js';
import { cardStore } from './state/cardStore.js';
import { isTourDone } from './state/onboarding.js';
import { getLegendaryCreatures } from './api/bulkData.js';

/**
 * Warm `cardStore` with the app's legendary-creature set. Runs after the binder
 * is interactive, so the page is usable immediately while the (cached) bulk
 * data fills in for Statistics / Compare Collections.
 */
async function warmCollectionStore() {
  try {
    const { cards } = await getLegendaryCreatures();
    for (const card of cards) cardStore.add(card);
  } catch (err) {
    console.error('Failed to load the card collection:', err);
  }
}

/** Replay entry point, always available from the sidebar. */
function addTourLink() {
  addButtonToSidebar('❓ App Tour', () => startFirstRunTour({ force: true }), 'settings', 20);
}

/**
 * Auto-run the binder tour on a first visit, once the editor has mounted and
 * there is an anchor to point at. Guests still looking at the welcome panel get
 * the panel's own tour button instead of a second overlay on top of it.
 */
function scheduleFirstRunTour() {
  if (isTourDone('binder')) return;
  if (document.querySelector('.guest-welcome, .guest-mode-container')) return;

  const waitForEditor = (attempt = 0) => {
    const anchor = document.querySelector(
      '#binder-root .binder-tab, #binder-root .binder-slot, #binder-root .binder-tabs'
    );
    if (anchor || attempt >= 20) {
      startFirstRunTour();
      return;
    }
    window.setTimeout(() => waitForEditor(attempt + 1), 250);
  };
  window.setTimeout(waitForEditor, 500);
}

document.addEventListener('DOMContentLoaded', async () => {
  const { tooltip, statesReady } = await bootShell();

  // Cross-link back to the browse/collection view.
  addButtonToSidebar(
    '🔎 Browse Cards',
    () => {
      // Preserve `?share=` so a share visitor stays in the owner's view.
      window.location.href = `index.html${window.location.search}`;
    },
    'browse',
    5
  );

  const root = document.getElementById('binder-root');
  // Shared tile interactions (ownership toggle, preview, printing cycle,
  // wishlist, add-to-list) work inside the pockets too.
  initCardInteractions(root, tooltip);
  initViewportMetrics();
  addTourLink();

  // The guest welcome's "Take a quick tour" button, and any other entry point
  // that does not want to import the tour module directly.
  document.addEventListener('tour:start', () => startFirstRunTour({ force: true }));

  // The editor needs the saved ownership state (for the owned/missing styling)
  // before it renders; its card data is fetched lazily per page.
  await statesReady;
  await initBinderBuilder(root);

  scheduleFirstRunTour();

  // Background enrichment for the collection-wide tools.
  warmCollectionStore();
});
