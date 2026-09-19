// main.js
import { bootShell, showModal } from './app/shell.js';
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
import { createBulkCheckButton, createExportButton, updateAllBinderCounts } from './ui/layout.js';
import { addButtonToSidebar } from './ui/components/sidebar.js';

// setupUI stays importable from here for the existing tests/bootstrap callers.
export { setupUI } from './app/shell.js';

/**
 * The bulk-check dialog is heavy, so it is pulled in on demand (its own chunk).
 */
const loadBulkCheckModal = async () =>
  (await import('./ui/components/bulkCardModal.js')).createBulkCheckModal();

/** The binder builder is a separate page; this is the link that reaches it. */
function addBinderBuilderLink() {
  addButtonToSidebar(
    '🗂️ Binder Builder',
    () => {
      window.location.href = 'binder.html';
    },
    'collection',
    15
  );
}

document.addEventListener('DOMContentLoaded', async () => {
  const { results, tooltip } = await bootShell();

  initScrollPosition();
  initLazyCards(results, tooltip);
  initYearScrubber();
  updateAllBinderCounts();
  createBulkCheckButton(() => showModal(loadBulkCheckModal));
  createExportButton();
  addBinderBuilderLink();

  initViewportMetrics();
  initSearch();
  initFilterBar({ onChange: refreshCardFilter, onSortChange: applySort });
  initCardInteractions(results, tooltip);
  initBulkEdit();
  initKeyboardShortcuts();
});
