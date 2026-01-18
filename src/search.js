import { appState } from './appState.js';
import { debounce } from './utils/debounce.js';
import { updateOwnedCounter } from './ui/ownedCounter.js';
import { isCardMissing } from './cardState.js';
import { cardStore } from './loadedCards.js';

export async function searchCards(query, filterUnowned = true) {
    const allCards = cardStore.getAll();
    if (!allCards) return { data: [] };

    const conditions = parseQuery(query);
    let filteredCards = allCards;
    if (conditions.length > 0) {
        filteredCards = allCards.data.filter(card => {
            return conditions.every(condition => evaluateCondition(card, condition));
        });
    }

    if (filterUnowned) {
        filteredCards = filteredCards.filter(card => !isCardMissing(card));
    }

    return { data: filteredCards };
}

export function parseQuery(query) {
  query = query.replace(/\s+(or|and)\s+/gi, (match) => ` ${match.toLowerCase().trim()} `);
  const raw_tokens = query.match(/!?\w+:(".*?"|'.*?')|\(|\)|or|and|!?[^\s()]+/g) || [];

  const tokens = raw_tokens.flatMap(token => {
    if (token.includes(':') && !token.includes('"') && !token.includes("'")) {
      const isNegated = token.startsWith('!');
      const tokenContent = isNegated ? token.substring(1) : token;
      const [key, ...rest] = tokenContent.split(':');
      const value = rest.join(':');

      const separators = [
        { char: ',', op: isNegated ? 'and' : 'or' }, // De Morgan's Law: !(A or B) <=> !A and !B
        { char: '&', op: isNegated ? 'or' : 'and' },  // De Morgan's Law: !(A and B) <=> !A or !B
      ];

      for (const sep of separators) {
        if (value.includes(sep.char)) {
          const values = value.split(sep.char);
          const expansion = values.map(v => `${isNegated ? '!' : ''}${key}:${v.trim()}`);
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
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
    match = cardColors.length > 0 && cardColors.every(color => queryColors.includes(color));
  } else if (filter.startsWith('c=') || filter.startsWith('c:')) {
    const queryColors = filter.substring(2).toUpperCase().split('').sort();
    const cardColors = (card.cardData.color_identity || []).sort();
    match = JSON.stringify(queryColors) === JSON.stringify(cardColors);
  } else if (filter.startsWith('c>')) {
    const queryColors = filter.substring(2).toUpperCase().split('');
    const cardColors = card.cardData.color_identity || [];
    match = queryColors.every(color => cardColors.includes(color));
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
      const [startYear, endYear] = dateTerm.split('-').map(y => parseInt(y, 10));
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
      match = !isCardMissing(card.cardData);
    }
  } else {
    const cardName = card.cardData.name.toLowerCase();
    const searchTerm = getFilterValue(filter);
    match = cardName.includes(searchTerm);
  }

  return not ? !match : match;
}

export function initSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  const searchTooltip = document.getElementById('search-tooltip');
  let tooltipTimeout;

  searchInput.addEventListener('mouseenter', () => {
    tooltipTimeout = setTimeout(() => {
      searchTooltip.style.display = 'block';
    }, 1500);
  });

  searchInput.addEventListener('mouseleave', () => {
    clearTimeout(tooltipTimeout);
    searchTooltip.style.display = 'none';
  });

  const clearSearchButton = document.getElementById('clear-search');
  const noResultsMessage = document.getElementById('no-results-message');

  const debouncedFilter = debounce(() => {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const conditions = parseQuery(searchTerm);

    let visibleCardCount = 0;
    document.querySelectorAll('.card').forEach(card => {
      const isVisible = conditions.every(condition => evaluateCondition(card, condition));

      if (isVisible) {
        visibleCardCount++;
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });

    updateOwnedCounter();

    if (visibleCardCount === 0 && searchTerm) {
      noResultsMessage.style.display = 'block';
    } else {
      noResultsMessage.style.display = 'none';
    }

    document.querySelectorAll('.binder').forEach(binder => {
      let visibleCardsInBinder = 0;
      binder.querySelectorAll('.section').forEach(section => {
        const visibleCardsInSection = Array.from(section.querySelectorAll('.card')).filter(card => card.style.display !== 'none').length;
        if (visibleCardsInSection === 0) {
          section.style.display = 'none';
        } else {
          section.style.display = '';
          visibleCardsInBinder++;
        }
      });

      if (visibleCardsInBinder === 0) {
        binder.style.display = 'none';
      } else {
        binder.style.display = '';
      }
    });

    if (searchInput.value) {
      clearSearchButton.style.display = 'block';
    } else {
      clearSearchButton.style.display = 'none';
    }
  }, 250);

  searchInput.addEventListener('input', debouncedFilter);

  clearSearchButton.addEventListener('click', () => {
    searchInput.value = '';
    debouncedFilter();
    updateOwnedCounter();
  });
}
