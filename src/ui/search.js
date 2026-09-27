import { debounce } from '../utils/debounce.js';
import { isHoverCapable } from '../utils/pointer.js';
import { renderSearchHelp } from './searchHelp.js';
import { updateOwnedCounter } from './components/ownedCounter.js';
import { getSavedSearch, saveSearch } from '../state/viewState.js';
import { activeFilterCount, cardMatchesFilters } from '../state/filters.js';
import { escapeHtml } from '../utils/html.js';
import { evaluateCondition, parseQuery } from '../state/cardQuery.js';

// Re-exported so existing importers (and tests) keep using `search.js`.
export { evaluateCondition, parseQuery };

/** Active, normalized query; keeps `reapplySearchFilter` cheap when empty. */
let activeQuery = '';

/** Clear the search box and every active filter, then re-run the grid filter. */
function clearSearchAndFilters() {
  const searchInput = document.getElementById('search-input');
  if (searchInput?.value) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // The filter bar owns its own state; its reset button is the single source of
  // truth for clearing everything except the sort. Fall back to a plain repaint
  // when there is no filter to clear.
  const reset = document.querySelector('.filter-reset');
  if (reset && !reset.disabled) reset.click();
  else refreshCardFilter();
}

/** Exact copy for the empty state, based on what is narrowing the grid. */
function noResultsCopy(hasSearch, hasFilters) {
  if (hasSearch && hasFilters) return 'No cards match your search and filters.';
  if (hasSearch) return 'No cards match your search.';
  return 'No cards match the active filters.';
}

/** Build the empty-state block once; re-rendering only when the copy changes. */
function renderNoResults(message) {
  const box = document.getElementById('no-results-message');
  if (!box || box.dataset.message === message) return;
  box.dataset.message = message;
  box.innerHTML = `
    <svg class="no-results-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.6" />
      <path d="m16.4 16.4 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <p class="no-results-text">${escapeHtml(message)}</p>
    <button type="button" class="no-results-clear">Clear search &amp; filters</button>`;
  box.querySelector('.no-results-clear')?.addEventListener('click', clearSearchAndFilters);
}

/**
 * Hide cards that don't match the query and roll section/binder visibility up
 * in a single pass, instead of re-querying and re-allocating arrays per binder.
 * Reads the live input value, so it serves as both the initial and re-applied
 * filter.
 */
function filterCards() {
  const searchInput = document.getElementById('search-input');
  const clearSearchButton = document.getElementById('clear-search');
  const noResultsMessage = document.getElementById('no-results-message');
  if (!searchInput) return;

  const searchTerm = searchInput.value.toLowerCase().trim();
  activeQuery = searchTerm;
  saveSearch(searchTerm);

  const conditions = parseQuery(searchTerm);
  let visibleCardCount = 0;
  const hasConditions = conditions.length > 0;
  // Nothing to filter by means every rendered card is visible, so a section or
  // binder with zero visible cards is simply one whose cards have not rendered
  // yet (the first binder exists before the first page arrives). Hiding those
  // would blank the whole grid until some unrelated pass happened to re-run.
  const isFiltering = hasConditions || activeFilterCount() > 0;

  document.querySelectorAll('.binder').forEach((binder) => {
    let visibleCardsInBinder = 0;

    binder.querySelectorAll('.section').forEach((section) => {
      let visibleCardsInSection = 0;

      section.querySelectorAll('.card').forEach((card) => {
        const matchesQuery =
          !hasConditions || conditions.every((condition) => evaluateCondition(card, condition));
        const isVisible = matchesQuery && cardMatchesFilters(card.cardData);

        card.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCardsInSection++;
      });

      section.style.display = isFiltering && visibleCardsInSection === 0 ? 'none' : '';
      if (visibleCardsInSection > 0) visibleCardsInBinder++;
      visibleCardCount += visibleCardsInSection;
    });

    binder.style.display = isFiltering && visibleCardsInBinder === 0 ? 'none' : '';
  });

  updateOwnedCounter();

  if (noResultsMessage) {
    const hasSearch = Boolean(searchTerm);
    const hasFilters = activeFilterCount() > 0;
    // Only claim "no matches" once cards have actually rendered; during the
    // initial load the grid is legitimately empty.
    const hasRenderedCards = document.querySelectorAll('.card').length > 0;
    const show = visibleCardCount === 0 && (hasSearch || hasFilters) && hasRenderedCards;

    noResultsMessage.style.display = show ? 'flex' : 'none';
    if (show) renderNoResults(noResultsCopy(hasSearch, hasFilters));
  }
  if (clearSearchButton) {
    clearSearchButton.style.display = searchInput.value ? 'block' : 'none';
  }

  // Filtering only toggles `display`, which the scrubber's MutationObserver
  // can't see, so tell it to rebuild its marks from the visible sections.
  document.dispatchEvent(new CustomEvent('cards:filtered'));
}

const debouncedFilter = debounce(filterCards, 250);

/**
 * Re-apply the active query and/or filter-bar state after new pages render, so
 * cards loaded after a change don't slip through unfiltered. No-op when neither
 * is active.
 */
export function reapplySearchFilter() {
  if (activeQuery || activeFilterCount() > 0) filterCards();
}

/**
 * Re-run the filter unconditionally. The filter bar uses this because clearing
 * the last active filter would otherwise be skipped by the guard above,
 * leaving the previously hidden cards hidden.
 */
export function refreshCardFilter() {
  filterCards();
}

export function initSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  const searchTooltip = document.getElementById('search-tooltip');
  const searchHelp = document.getElementById('search-help');
  if (searchTooltip) renderSearchHelp(searchTooltip);
  let tooltipTimeout;
  let openedByHover = false;

  const isHelpOpen = () => searchTooltip?.style.display === 'block';

  function setHelpOpen(open) {
    if (!searchTooltip) return;
    searchTooltip.style.display = open ? 'block' : 'none';
    searchHelp?.setAttribute('aria-expanded', String(open));
    // Mobile turns the list into a bottom sheet with a tap-eating backdrop.
    document.body.classList.toggle('search-help-open', open);
  }

  // Desktop convenience: hovering the search field (or the panel itself, which
  // lives in the same wrapper) reveals the syntax list, so it can be scrolled
  // without the pointer leaving it. Touch has no hover phase — the `?` button is
  // the explicit path there — so these listeners are not bound at all on touch,
  // which also stops the sheet from popping up on its own after a tap.
  const hoverArea = document.getElementById('search-wrapper') ?? searchInput;

  if (isHoverCapable()) {
    hoverArea.addEventListener('mouseenter', () => {
      tooltipTimeout = setTimeout(() => {
        openedByHover = true;
        setHelpOpen(true);
      }, 1500);
    });

    hoverArea.addEventListener('mouseleave', () => {
      clearTimeout(tooltipTimeout);
      // Retract only the hover preview; a sheet opened via the help button stays
      // put until it is dismissed explicitly.
      if (openedByHover) {
        openedByHover = false;
        setHelpOpen(false);
      }
    });
  }

  searchHelp?.addEventListener('click', (event) => {
    event.stopPropagation(); // keep the document handler below out of this click
    clearTimeout(tooltipTimeout);
    openedByHover = false;
    setHelpOpen(!isHelpOpen());
  });

  // Tapping or clicking anywhere else dismisses the sheet.
  document.addEventListener('click', (event) => {
    if (isHelpOpen() && !event.target.closest('#search-wrapper')) {
      openedByHover = false;
      setHelpOpen(false);
    }
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isHelpOpen()) {
      openedByHover = false;
      setHelpOpen(false);
    }
  });

  const clearSearchButton = document.getElementById('clear-search');

  searchInput.addEventListener('input', () => {
    // Typing means the user has the syntax figured out; get the sheet out of
    // the way of the results on a phone.
    if (isHelpOpen()) {
      openedByHover = false;
      setHelpOpen(false);
    }
    debouncedFilter();
  });

  clearSearchButton.addEventListener('click', () => {
    searchInput.value = '';
    filterCards();
  });

  // Restore the query from earlier in this tab and apply it to whatever has
  // already rendered (later pages are covered by `reapplySearchFilter`).
  const savedQuery = getSavedSearch();
  if (savedQuery) {
    searchInput.value = savedQuery;
    filterCards();
  }
}
