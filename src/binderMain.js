// src/binderMain.js
/**
 * Entry point for the Binder Builder page (`binder.html`).
 *
 * Reuses the shared app shell (auth, sidebar, collection/wishlist/lists,
 * settings) and replaces the browse grid with the binder editor. The full
 * legendary-creature collection is loaded into `cardStore` up front so the
 * picker can autocomplete names, occupied pockets can render real card tiles,
 * and the shared ownership/wishlist/preview interactions all work.
 */
import { bootShell } from './app/shell.js';
import { initBinderBuilder } from './ui/binderBuilder.js';
import { initCardInteractions } from './ui/cardInteractions.js';
import { initViewportMetrics } from './utils/viewport.js';
import { addButtonToSidebar } from './ui/components/sidebar.js';
import { showToast } from './ui/components/toast.js';
import { showLoading, hideLoading } from './ui/loadingIndicator.js';
import { resetCardPickerIndex } from './ui/components/cardPickerModal.js';
import { cardStore } from './state/cardStore.js';
import { getLegendaryCreatures } from './api/bulkData.js';

/** Populate `cardStore` from the (cached) Scryfall bulk subset. */
async function loadCollectionIntoStore() {
  showLoading();
  try {
    const { cards } = await getLegendaryCreatures();
    for (const card of cards) cardStore.add(card);
    resetCardPickerIndex();
  } catch (err) {
    console.error('Failed to load the card collection:', err);
    showToast('Could not load card data; the card picker may be empty.', 'error');
  } finally {
    hideLoading();
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
    5
  );

  const root = document.getElementById('binder-root');
  // Shared tile interactions (ownership toggle, preview, printing cycle,
  // wishlist, add-to-list) work inside the pockets too.
  initCardInteractions(root, tooltip);
  initViewportMetrics();

  // The editor needs both the card data (for picker names and tiles) and the
  // saved ownership state (for the owned/missing styling) before it renders.
  await Promise.all([loadCollectionIntoStore(), statesReady]);
  await initBinderBuilder(root);
});
