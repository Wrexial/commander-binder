// src/ui/components/cardNameInput.js
/**
 * A textarea with card-name autocomplete, shared by the "Add cards" and
 * "Bulk check" modals. Typing two or more characters on a line shows a short,
 * ranked list of matches from the loaded collection.
 */
import { cardStore, primaryName } from '../../state/cardStore.js';
import { getCatalogNames } from '../../state/cardCatalog.js';
import { normalizeName } from './collectionModal.js';

const MAX_SUGGESTIONS = 6;

/**
 * One pass over the store: lowercase name -> card. Indexed by the front-face
 * name the app tracks cards by (`primaryName`) *and* the full printed name, so
 * a paste of either "Front" or "Front // Back" resolves.
 */
function buildNameIndex() {
  const index = new Map();
  for (const card of cardStore.getAll()) {
    for (const key of new Set([normalizeName(primaryName(card)), normalizeName(card.name)])) {
      if (key && !index.has(key)) index.set(key, card);
    }
  }
  return index;
}

/**
 * Rank autocomplete matches: prefix matches first, then word-start matches,
 * then everything else. Keeps the list short and predictable. `lowerNames` is a
 * precomputed parallel array so typing does not lowercase the whole catalog.
 */
function findSuggestions(names, lowerNames, query) {
  const q = query.toLowerCase();
  if (q.length < 2) return [];

  const startsWith = [];
  const wordStart = [];
  const contains = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const lower = lowerNames[i];
    if (lower.startsWith(q)) {
      startsWith.push(name);
    } else if (lower.split(/[\s,]+/).some((word) => word.startsWith(q))) {
      wordStart.push(name);
    } else if (lower.includes(q)) {
      contains.push(name);
    }
  }

  return [...startsWith, ...wordStart, ...contains].slice(0, MAX_SUGGESTIONS);
}

/**
 * @param {object} config
 * @param {string} config.placeholder
 * @param {string} config.ariaLabel
 * @param {() => void} [config.onChange] Called after a suggestion is picked.
 * @returns {{ el: HTMLElement, textArea: HTMLTextAreaElement, nameIndex: Map<string, object> }}
 */
export function createCardNameInput({ placeholder, ariaLabel, onChange }) {
  const nameIndex = buildNameIndex();

  // Suggest every known card name, not just the legendary cards loaded into
  // `cardStore`, so all-cards entries autocomplete too. The combined list is
  // cached and only rebuilt when the store or the (streaming) catalog grows,
  // and a precomputed lowercase array keeps keystrokes cheap.
  let allNames = [];
  let lowerNames = [];
  let cachedStoreSize = -1;
  let cachedCatalogLength = -1;

  function getNames() {
    const catalog = getCatalogNames();
    if (nameIndex.size === cachedStoreSize && catalog.length === cachedCatalogLength) {
      return { names: allNames, lowerNames };
    }

    cachedStoreSize = nameIndex.size;
    cachedCatalogLength = catalog.length;
    allNames = [
      ...new Set([...[...nameIndex.values()].map((card) => primaryName(card)), ...catalog]),
    ].sort((a, b) => a.localeCompare(b));
    lowerNames = allNames.map((name) => name.toLowerCase());
    return { names: allNames, lowerNames };
  }

  const el = document.createElement('div');
  el.className = 'bulk-input-wrapper';

  const textArea = document.createElement('textarea');
  textArea.rows = 8;
  textArea.placeholder = placeholder;
  textArea.spellcheck = false;
  textArea.setAttribute('aria-label', ariaLabel);

  const suggestions = document.createElement('div');
  suggestions.className = 'suggestions-container';
  suggestions.setAttribute('role', 'listbox');
  suggestions.setAttribute('aria-label', 'Card name suggestions');

  el.append(textArea, suggestions);

  let activeSuggestionIndex = -1;

  function currentLineRange() {
    const text = textArea.value;
    const cursor = textArea.selectionStart;
    const start = text.lastIndexOf('\n', cursor - 1) + 1;
    const end = text.indexOf('\n', cursor);
    return { start, end: end === -1 ? text.length : end };
  }

  function hideSuggestions() {
    suggestions.style.display = 'none';
    suggestions.innerHTML = '';
    activeSuggestionIndex = -1;
  }

  function updateActiveSuggestion(items) {
    items.forEach((item, index) =>
      item.classList.toggle('active', index === activeSuggestionIndex)
    );
  }

  function selectSuggestion(name) {
    const { start, end } = currentLineRange();
    const text = textArea.value;
    const rest = text.slice(end).replace(/^\n+/, '');
    const replacement = rest ? `${name}\n${rest}` : `${name}\n`;

    textArea.value = text.slice(0, start) + replacement;
    const cursor = start + name.length + 1;
    textArea.focus();
    textArea.setSelectionRange(cursor, cursor);
    hideSuggestions();
    onChange?.();
  }

  function refreshSuggestions() {
    const { start, end } = currentLineRange();
    const query = textArea.value.slice(start, end).trim();

    if (query.length < 2) {
      hideSuggestions();
      return;
    }

    const { names, lowerNames: lowers } = getNames();
    const matches = findSuggestions(names, lowers, query);
    if (matches.length === 0) {
      hideSuggestions();
      return;
    }

    activeSuggestionIndex = -1;
    suggestions.innerHTML = '';
    matches.forEach((name) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.setAttribute('role', 'option');
      item.textContent = name;
      // mousedown (not click) so the textarea blur can't swallow it.
      item.addEventListener('mousedown', (mouseEvent) => {
        mouseEvent.preventDefault();
        selectSuggestion(name);
      });
      suggestions.appendChild(item);
    });
    suggestions.style.display = 'block';
  }

  function handleKeyDown(event) {
    const items = [...suggestions.querySelectorAll('.suggestion-item')];

    if (items.length > 0 && suggestions.style.display !== 'none') {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
        updateActiveSuggestion(items);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        // From nothing selected, Up lands on the last suggestion rather than
        // one short of it.
        activeSuggestionIndex =
          activeSuggestionIndex <= 0 ? items.length - 1 : activeSuggestionIndex - 1;
        updateActiveSuggestion(items);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && activeSuggestionIndex > -1) {
        event.preventDefault();
        selectSuggestion(items[activeSuggestionIndex].textContent);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        hideSuggestions();
      }
    }
  }

  textArea.addEventListener('input', refreshSuggestions);
  textArea.addEventListener('keydown', handleKeyDown);
  textArea.addEventListener('blur', () => {
    window.setTimeout(hideSuggestions, 120);
  });

  return { el, textArea, nameIndex };
}
