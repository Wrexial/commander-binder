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
    'collection',
    90
  );
}

document.addEventListener('DOMContentLoaded', async () => {
  const { results, tooltip } = await bootShell();

  initScrollPosition();
  initLazyCards(results, tooltip);
  initYearScrubber();
  updateAllBinderCounts();
  addBinderBuilderLink();

  initViewportMetrics();
  initSearch();
  initFilterBar({ onChange: refreshCardFilter, onSortChange: applySort });
  initCardInteractions(results, tooltip);
  initBulkEdit();
  initKeyboardShortcuts();
});
