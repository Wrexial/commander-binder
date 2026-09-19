// src/binderMain.js
/**
 * Entry point for the Binder Builder page (`binder.html`).
 *
 * Reuses the shared app shell (auth, sidebar, collection/wishlist/lists,
 * settings) and replaces the browse grid with the binder editor. Because a
 * binder can hold any card, the page does not preload the legendary-creature
 * bulk set: the picker searches Scryfall live and the editor hydrates only the
 * cards its pockets actually reference (see `api/cardSearch.js`). This keeps the
 * page fast and works for the whole card pool.
 */
import { bootShell } from './app/shell.js';
import { initBinderBuilder } from './ui/binderBuilder.js';
import { initCardInteractions } from './ui/cardInteractions.js';
import { initViewportMetrics } from './utils/viewport.js';
import { addButtonToSidebar } from './ui/components/sidebar.js';

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
    5
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
});
