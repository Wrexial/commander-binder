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
import { ensureSeedBinder } from './state/bindersState.js';
import { isTourDone } from './state/onboarding.js';
import { getLegendaryCreatures } from './api/bulkData.js';

/**
 * Run `task` once the browser is idle, so it does not compete with the first
 * render or the binder's own card fetches. Falls back to a short timeout where
 * `requestIdleCallback` is unavailable (Safari, jsdom).
 * @param {() => void} task
 */
function whenIdle(task) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task(), { timeout: 3000 });
    return;
  }
  window.setTimeout(task, 300);
}

/**
 * Warm `cardStore` with the app's legendary-creature set. Runs after the binder
 * is interactive, so the page is usable immediately while the (cached) bulk
 * data fills in for Statistics / Compare Collections. Cards are added in chunks
 * with a yield between them, so a few thousand adds never become one long task
 * that blocks input.
 */
async function warmCollectionStore() {
  try {
    const { cards } = await getLegendaryCreatures();
    const CHUNK_SIZE = 400;
    for (let i = 0; i < cards.length; i++) {
      cardStore.add(cards[i]);
      if ((i + 1) % CHUNK_SIZE === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
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
  const { tooltip, shellReady, statesReady } = await bootShell();

  // The binder source depends on the signed-in / share state (`loadBinders`
  // reads the server when signed in, IndexedDB otherwise), so the editor waits
  // for the shell to resolve before mounting.
  await shellReady;

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
  addTourLink();

  const root = document.getElementById('binder-root');
  // Shared tile interactions (ownership toggle, preview, printing cycle,
  // wishlist, add-to-list) work inside the pockets too.
  initCardInteractions(root, tooltip);
  initViewportMetrics();

  // The guest welcome's "Take a quick tour" button, and any other entry point
  // that does not want to import the tour module directly.
  document.addEventListener('tour:start', () => startFirstRunTour({ force: true }));

  // The editor only needs the binder records, which it loads itself, so mount
  // it without waiting for the collection/wishlist/list state. Ownership and
  // wishlist styling is applied to the already-mounted tiles by the shell's
  // `updateAllCardStates()` once `statesReady` resolves (and `render()` reads
  // the live state per tile), so the page becomes interactive much sooner.
  initBinderBuilder(root, { seed: false })
    .then(scheduleFirstRunTour)
    .catch((err) => console.error('Failed to mount the Binder Builder:', err));

  await statesReady;

  // Seed a first binder only after any guest→account merge has run, so a
  // signed-in visitor with local binders doesn't also get an empty "Binder 1".
  await ensureSeedBinder();

  // Background enrichment for the collection-wide tools; deferred to idle so it
  // does not slow down the editor's first paint or its card fetches.
  whenIdle(warmCollectionStore);
});
