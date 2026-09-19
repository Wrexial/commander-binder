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
import { cardStore } from './state/cardStore.js';
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

document.addEventListener('DOMContentLoaded', async () => {
  const { tooltip, statesReady } = await bootShell();

  // Cross-link back to the browse/collection view.
  addButtonToSidebar(
    '🔎 Browse Cards',
    () => {
      // Preserve `?share=` so a share visitor stays in the owner's view.
      window.location.href = `index.html${window.location.search}`;
    },
    'collection',
    90
  );

  const root = document.getElementById('binder-root');
  // Shared tile interactions (ownership toggle, preview, printing cycle,
  // wishlist, add-to-list) work inside the pockets too.
  initCardInteractions(root, tooltip);
  initViewportMetrics();

  // The editor needs the saved ownership state (for the owned/missing styling)
  // before it renders; its card data is fetched lazily per page.
  await statesReady;
  await initBinderBuilder(root);

  // Background enrichment for the collection-wide tools.
  warmCollectionStore();
});
