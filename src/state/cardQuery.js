// src/state/cardQuery.js
/**
 * The browse search's "smart filter": parse a query string into conditions and
 * evaluate them against a card. Kept free of the grid so the Binder Builder can
 * reuse the exact same syntax.
 *
 * `card` may be a Scryfall card object or a browse tile (`.cardData`); both are
 * accepted so the grid can pass its elements unchanged.
 */
import { isCardOwned, getOwnedAddedAt } from './cardState.js';
import { isCardWanted, getWantedAddedAt } from './wishlistState.js';
import { getListByName, getListsForCard, isInList } from './listsState.js';
import { getDisplayedPrice } from '../utils/prices.js';
import { cardStore } from './cardStore.js';
import { appState } from './appState.js';

/**
 * Parse a query into a list of condition trees (each top-level entry is OR-ed).
 * Supports `key:value`, quoting, `!` negation, `and`/`or`, parentheses and
 * comma/ampersand shorthands (with De Morgan expansion).
 *
 * @param {string} query
 * @returns {object[]}
 */
export function parseQuery(query) {
  query = String(query || '').replace(
    /\s+(or|and)\s+/gi,
    (match) => ` ${match.toLowerCase().trim()} `
  );
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

/** Parse + evaluate a whole query against one card. */
export function cardMatchesQuery(card, query) {
  const conditions = parseQuery(query);
  if (conditions.length === 0) return true;
  return conditions.every((condition) => evaluateCondition(card, condition));
}

/** How recent `is:new` means, in milliseconds (30 days). */
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * True when the card was added to the collection or wishlist within the
 * `is:new` window. Any printing of the name counts, matching `isCardOwned`.
 * @param {object} card Scryfall card object.
 */
function wasAddedRecently(card) {
  const cutoff = Date.now() - NEW_WINDOW_MS;
  const ids = [card.id, ...cardStore.getPrintings(card.name).map((printing) => printing.id)];
  return [getOwnedAddedAt(), getWantedAddedAt()].some((map) =>
    ids.some((id) => {
      const at = map.get(id);
      return at ? Date.parse(at) >= cutoff : false;
    })
  );
}

function cardMatchesFilter(cardOrElement, filter) {
  if (!filter) return true;
  // Accept a browse tile (`.cardData`) or a bare card object.
  const card = cardOrElement?.cardData ?? cardOrElement;
  if (!card) return false;

  const not = filter.startsWith('!');
  if (not) {
    filter = filter.substring(1);
  }

  let match = false;
  if (filter.startsWith('t:')) {
    const typeTerm = getFilterValue(filter, 't:');
    const typeLine = card.type_line?.toLowerCase() || '';
    match = typeLine.includes(typeTerm);
  } else if (filter.startsWith('o:')) {
    const oracleTerm = getFilterValue(filter, 'o:');
    const oracleText = card.oracle_text?.toLowerCase() || '';
    match = oracleText.includes(oracleTerm);
  } else if (filter.startsWith('c<')) {
    const queryColors = filter.substring(2).toUpperCase().split('');
    const cardColors = card.color_identity || [];
    match = cardColors.length > 0 && cardColors.every((color) => queryColors.includes(color));
  } else if (filter.startsWith('c=') || filter.startsWith('c:')) {
    const queryColors = filter.substring(2).toUpperCase().split('').sort();
    // Copy before sorting: `color_identity` lives on the shared card object and
    // its order drives the multicolor stripe gradient, so a read-only filter
    // must not reorder it in place.
    const cardColors = [...(card.color_identity || [])].sort();
    match = JSON.stringify(queryColors) === JSON.stringify(cardColors);
  } else if (filter.startsWith('c>')) {
    const queryColors = filter.substring(2).toUpperCase().split('');
    const cardColors = card.color_identity || [];
    match = queryColors.every((color) => cardColors.includes(color));
  } else if (filter.startsWith('s:')) {
    const setTerm = getFilterValue(filter, 's:');
    const setCode = card.set?.toLowerCase() || '';
    const setName = card.set_name?.toLowerCase() || '';
    if (appState.seenSetCodes.has(setTerm)) {
      match = setCode === setTerm;
    } else {
      match = setCode.includes(setTerm) || setName.includes(setTerm);
    }
  } else if (filter.startsWith('d:')) {
    const dateTerm = filter.substring(2);
    const releaseDate = card.released_at || '';
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
    const rarity = card.rarity?.toLowerCase() || '';
    match = rarity === rarityTerm;
  } else if (filter.startsWith('is:')) {
    const term = filter.substring(3).toLowerCase();
    switch (term) {
      case 'owned':
        match = isCardOwned(card);
        break;
      case 'missing':
        match = !isCardOwned(card);
        break;
      case 'wanted':
        match = isCardWanted(card);
        break;
      case 'new':
        match = wasAddedRecently(card);
        break;
      case 'listed':
        match = getListsForCard(card).length > 0;
        break;
      case 'colorless':
        match = (card.color_identity || []).length === 0;
        break;
      case 'multicolor':
        match = (card.color_identity || []).length > 1;
        break;
      case 'dfc':
        match = Array.isArray(card.card_faces) && card.card_faces.length > 0;
        break;
    }
  } else if (filter.startsWith('list:')) {
    const listName = getFilterValue(filter, 'list:').toLowerCase();
    const list = getListByName(listName);
    match = list ? isInList(list.id, card) : false;
  } else if (filter.startsWith('price:')) {
    const priceTerm = getFilterValue(filter, 'price:').replace(',', '.');
    const price = getDisplayedPrice(card);
    if (price == null) {
      match = false;
    } else if (priceTerm.includes('-')) {
      const [minPrice, maxPrice] = priceTerm.split('-').map((p) => parseFloat(p));
      match = price >= minPrice && price <= maxPrice;
    } else {
      match = price >= parseFloat(priceTerm);
    }
  } else {
    const cardName = card.name.toLowerCase();
    const searchTerm = getFilterValue(filter);
    match = cardName.includes(searchTerm);
  }

  return not ? !match : match;
}
