import { appState } from '../state/appState.js';
import { debounce } from '../utils/debounce.js';
import { isHoverCapable } from '../utils/pointer.js';
import { renderSearchHelp } from './searchHelp.js';
import { updateOwnedCounter } from './components/ownedCounter.js';
import { isCardOwned } from '../state/cardState.js';
import { getSavedSearch, saveSearch } from '../state/viewState.js';
import { activeFilterCount, cardMatchesFilters } from '../state/filters.js';

export function parseQuery(query) {
  query = query.replace(/\s+(or|and)\s+/gi, (match) => ` ${match.toLowerCase().trim()} `);
  const raw_tokens = query.match(/!?\w+:(".*?"|'.*?')|\(|\)|or|and|!?[^\s()]+/g) || [];

  const tokens = raw_tokens.flatMap((token) => {
    if (token.includes(':') && !token.includes('"') && !token.includes("'")) {
      const isNegated = token.startsWith('!');
      const tokenContent = isNegated ? token.substring(1) : token;
      const [key, ...rest] = tokenContent.split(':');
      const value = rest.join(':');

      const separators = [
        { char: ',', op: isNegated ? 'and' : 'or' }, // De Morgan's Law: !(A or B) <=> !A and !B
        { char: '&', op: isNegated ? 'or' : 'and' }, // De Morgan's Law: !(A and B) <=> !A or !B
      ];

      for (const sep of separators) {
        if (value.includes(sep.char)) {
          const values = value.split(sep.char);
          const expansion = values.map((v) => `${isNegated ? '!' : ''}${key}:${v.trim()}`);
          const result = expansion.flatMap((term, i) => (i > 0 ? [sep.op, term] : [term]));
          return ['(', ...result, ')'];
        }
      }
    }
    return token;
  });
  let index = 0;

  function parseOr() {
    let left = parseAnd();
    while (tokens[index] === 'or') {
      index++;
      const right = parseAnd();
      left = { type: 'or', left, right };
    }
    return left;
  }

  function parseAnd() {
    let left = parseTerm();
    while (tokens[index] === 'and') {
      index++;
      const right = parseTerm();
      left = { type: 'and', left, right };
    }
    return left;
  }

  function parseTerm() {
    if (tokens[index] === '(') {
      index++;
      const expr = parseOr();
      if (tokens[index] === ')') {
        index++;
        return expr;
      }
    }
    const value = tokens[index++];
    if (value && (value.toLowerCase() === 'and' || value.toLowerCase() === 'or')) {
      return parseTerm();
    }
    return { type: 'filter', value };
  }

  const result = [];
  while (index < tokens.length) {
    result.push(parseOr());
  }
  return result;
}

function getFilterValue(filter, prefix = '') {
  let value = prefix ? filter.substring(prefix.length) : filter;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function evaluateCondition(card, condition) {
  if (!condition) return true;
  if (condition.type === 'or') {
    return evaluateCondition(card, condition.left) || evaluateCondition(card, condition.right);
  }
  if (condition.type === 'and') {
    return evaluateCondition(card, condition.left) && evaluateCondition(card, condition.right);
  }
  if (condition.type === 'filter') {
    return cardMatchesFilter(card, condition.value);
  }
  return true;
}

function cardMatchesFilter(card, filter) {
  if (!filter) return true;
  const not = filter.startsWith('!');
  if (not) {
    filter = filter.substring(1);
  }

  let match = false;
  if (filter.startsWith('t:')) {
    const typeTerm = getFilterValue(filter, 't:');
    const typeLine = card.cardData.type_line?.toLowerCase() || '';
    match = typeLine.includes(typeTerm);
  } else if (filter.startsWith('o:')) {
    const oracleTerm = getFilterValue(filter, 'o:');
    const oracleText = card.cardData.oracle_text?.toLowerCase() || '';
    match = oracleText.includes(oracleTerm);
  } else if (filter.startsWith('c<')) {
    const queryColors = filter.substring(2).toUpperCase().split('');
    const cardColors = card.cardData.color_identity || [];
    match = cardColors.length > 0 && cardColors.every((color) => queryColors.includes(color));
  } else if (filter.startsWith('c=') || filter.startsWith('c:')) {
    const queryColors = filter.substring(2).toUpperCase().split('').sort();
    const cardColors = (card.cardData.color_identity || []).sort();
    match = JSON.stringify(queryColors) === JSON.stringify(cardColors);
  } else if (filter.startsWith('c>')) {
    const queryColors = filter.substring(2).toUpperCase().split('');
    const cardColors = card.cardData.color_identity || [];
    match = queryColors.every((color) => cardColors.includes(color));
  } else if (filter.startsWith('s:')) {
    const setTerm = getFilterValue(filter, 's:');
    const setCode = card.cardData.set?.toLowerCase() || '';
    const setName = card.cardData.set_name?.toLowerCase() || '';
    if (appState.seenSetCodes.has(setTerm)) {
      match = setCode === setTerm;
    } else {
      match = setCode.includes(setTerm) || setName.includes(setTerm);
    }
  } else if (filter.startsWith('d:')) {
    const dateTerm = filter.substring(2);
    const releaseDate = card.cardData.released_at || '';
    const releaseYear = parseInt(releaseDate.substring(0, 4), 10);
    if (dateTerm.includes('-')) {
      const [startYear, endYear] = dateTerm.split('-').map((y) => parseInt(y, 10));
      match = releaseYear >= startYear && releaseYear <= endYear;
    } else {
      const year = parseInt(dateTerm, 10);
      match = releaseYear === year;
    }
  } else if (filter.startsWith('r:')) {
    const rarityTerm = filter.substring(2);
    const rarity = card.cardData.rarity?.toLowerCase() || '';
    match = rarity === rarityTerm;
  } else if (filter.startsWith('is:')) {
    const term = filter.substring(3);
    if (term === 'owned') {
      match = isCardOwned(card.cardData);
    }
  } else if (filter.startsWith('price:')) {
    const priceTerm = getFilterValue(filter, 'price:').replace(',', '.');
    const price = parseFloat(card.cardData.prices?.eur);
    if (isNaN(price)) {
      match = false;
    } else if (priceTerm.includes('-')) {
      const [minPrice, maxPrice] = priceTerm.split('-').map((p) => parseFloat(p));
      match = price >= minPrice && price <= maxPrice;
    } else {
      match = price >= parseFloat(priceTerm);
    }
  } else {
    const cardName = card.cardData.name.toLowerCase();
    const searchTerm = getFilterValue(filter);
    match = cardName.includes(searchTerm);
  }

  return not ? !match : match;
}

/** Active, normalized query; keeps `reapplySearchFilter` cheap when empty. */
let activeQuery = '';

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

      section.style.display = visibleCardsInSection === 0 ? 'none' : '';
      if (visibleCardsInSection > 0) visibleCardsInBinder++;
      visibleCardCount += visibleCardsInSection;
    });

    binder.style.display = visibleCardsInBinder === 0 ? 'none' : '';
  });

  updateOwnedCounter();

  if (noResultsMessage) {
    noResultsMessage.style.display = visibleCardCount === 0 && searchTerm ? 'block' : 'none';
  }
  if (clearSearchButton) {
    clearSearchButton.style.display = searchInput.value ? 'block' : 'none';
  }
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
