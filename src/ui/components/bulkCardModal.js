import { debounce } from '../../utils/debounce.js';
import { escapeHtml } from '../../utils/html.js';
import { createModal } from './modal.js';
import { showToast } from './toast.js';
import { isCardOwned, setCardsOwned } from '../../state/cardState.js';
import { cardStore } from '../../state/cardStore.js';
import { updateAllCardStates } from '../cards.js';
import { updateAllBinderCounts } from '../layout.js';
import { updateOwnedCounter } from './ownedCounter.js';

const MAX_SUGGESTIONS = 6;
const VALIDATION_DEBOUNCE_MS = 250;

/** Per-mode copy. Behaviour differences are keyed off `mode`. */
const MODE_CONFIG = {
  add: {
    title: 'Bulk Add Cards',
    subtitle: 'Paste one card name per line. Cards you already own are skipped.',
    placeholder: 'One card name per line (Ctrl+Enter to add)',
    missingLabel: 'Will add',
  },
  check: {
    title: 'Bulk Check Cards',
    subtitle: 'Paste one card name per line to see what you own.',
    placeholder: 'One card name per line (Ctrl+Enter to check)',
    missingLabel: 'Missing',
  },
};

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

/** One pass over the store: lowercase name -> card. Reused for every lookup. */
function buildNameIndex() {
  const index = new Map();
  for (const card of cardStore.getAll()) {
    const key = normalizeName(card.name);
    if (key && !index.has(key)) {
      index.set(key, card);
    }
  }
  return index;
}

/**
 * Rank autocomplete matches: prefix matches first, then word-start matches,
 * then everything else. Keeps the list short and predictable.
 */
function findSuggestions(names, query) {
  const q = query.toLowerCase();
  if (q.length < 2) return [];

  const startsWith = [];
  const wordStart = [];
  const contains = [];

  for (const name of names) {
    const lower = name.toLowerCase();
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
 * Create the shared Bulk Add / Bulk Check modal.
 *
 * @param {'add'|'check'} mode
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createBulkCardModal(mode) {
  const config = MODE_CONFIG[mode];
  if (!config) throw new Error(`Unknown bulk modal mode: "${mode}"`);

  const nameIndex = buildNameIndex();
  const allNames = [...nameIndex.values()]
    .map((card) => card.name)
    .sort((a, b) => a.localeCompare(b));

  const shell = createModal({ className: 'bulk-modal', ariaLabel: config.title });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';

  const heading = document.createElement('h2');
  heading.textContent = config.title;

  const subtitle = document.createElement('p');
  subtitle.className = 'bulk-modal-subtitle';
  subtitle.textContent = config.subtitle;

  header.append(heading, subtitle);

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-content-area bulk-content';

  const wrapper = document.createElement('div');
  wrapper.className = 'bulk-input-wrapper';

  const textArea = document.createElement('textarea');
  textArea.rows = 8;
  textArea.placeholder = config.placeholder;
  textArea.spellcheck = false;
  textArea.setAttribute('aria-label', 'Card names, one per line');

  const suggestions = document.createElement('div');
  suggestions.className = 'suggestions-container';
  suggestions.setAttribute('role', 'listbox');

  wrapper.append(textArea, suggestions);

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';

  contentArea.append(wrapper, preview);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-button-container';

  const primaryButton = document.createElement('button');
  primaryButton.type = 'button';
  primaryButton.className = 'primary';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';

  buttonContainer.append(primaryButton, closeButton);

  modal.append(header, contentArea, buttonContainer);

  let activeSuggestionIndex = -1;
  let categorized = { owned: [], missing: [], unknown: [] };
  let confirming = false;

  const nameOf = (entry) => (typeof entry === 'string' ? entry : entry.name);

  /** Split the textarea into owned / missing / unknown, de-duplicating. */
  function categorize() {
    const seen = new Set();
    const owned = [];
    const missing = [];
    const unknown = [];

    for (const line of textArea.value.split('\n')) {
      const key = normalizeName(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const card = nameIndex.get(key);
      if (!card) {
        unknown.push(line.trim());
      } else if (isCardOwned(card)) {
        owned.push(card);
      } else {
        missing.push(card);
      }
    }

    return { owned, missing, unknown };
  }

  function summaryChip(status, label, count) {
    return `<span class="bulk-summary-chip bulk-chip-${status}">${label} <strong>${count}</strong></span>`;
  }

  function group(status, label, entries) {
    if (entries.length === 0) return '';

    const rows = entries
      .map((entry) => `<li class="bulk-row bulk-row-${status}">${escapeHtml(nameOf(entry))}</li>`)
      .join('');

    return `<section class="bulk-group"><h3>${label}<span>${entries.length}</span></h3><ul>${rows}</ul></section>`;
  }

  function updatePrimary() {
    const count = categorized.missing.length;

    if (mode === 'add') {
      primaryButton.textContent =
        count > 0 ? `Add ${count} card${count === 1 ? '' : 's'}` : 'Add cards';
    } else {
      primaryButton.textContent = count > 0 ? `Copy ${count} missing` : 'Copy missing';
    }

    primaryButton.disabled = count === 0 || confirming;
  }

  function renderPreview() {
    categorized = categorize();
    const { owned, missing, unknown } = categorized;

    if (owned.length + missing.length + unknown.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">No card names yet.</p>';
      updatePrimary();
      return;
    }

    preview.innerHTML = `
            <div class="bulk-summary">
                ${summaryChip('owned', 'Owned', owned.length)}
                ${summaryChip('missing', config.missingLabel, missing.length)}
                ${summaryChip('unknown', 'Not found', unknown.length)}
            </div>
            <div class="bulk-groups">
                ${group('owned', 'Owned', owned)}
                ${group('missing', config.missingLabel, missing)}
                ${group('unknown', 'Not found', unknown)}
            </div>`;
    updatePrimary();
  }

  async function handlePrimary() {
    if (confirming) return;

    categorized = categorize();
    const { missing } = categorized;
    if (missing.length === 0) return;

    if (mode === 'check') {
      const text = missing.map((card) => card.name).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showToast(
          `Copied ${missing.length} missing card${missing.length === 1 ? '' : 's'}.`,
          'success'
        );
      } catch (err) {
        console.error('Failed to copy missing cards:', err);
        showToast('Could not copy to the clipboard.', 'error');
      }
      return;
    }

    confirming = true;
    updatePrimary();
    try {
      await setCardsOwned(missing, true);
      showToast(`Added ${missing.length} card${missing.length === 1 ? '' : 's'}.`, 'success');
      updateAllCardStates();
      updateAllBinderCounts();
      updateOwnedCounter();
      // Re-render: the added cards now show up under "Owned".
      renderPreview();
    } catch (err) {
      console.error('Bulk add failed:', err);
      showToast('Could not add the cards.', 'error');
    } finally {
      confirming = false;
      updatePrimary();
    }
  }

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
    items.forEach((item, index) => {
      item.classList.toggle('active', index === activeSuggestionIndex);
    });
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
    renderPreview();
  }

  function handleAutocomplete(event) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
      return;
    }

    const { start, end } = currentLineRange();
    const query = textArea.value.slice(start, end).trim();

    if (query.length < 2) {
      hideSuggestions();
      return;
    }

    const matches = findSuggestions(allNames, query);
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
        activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
        updateActiveSuggestion(items);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (activeSuggestionIndex > -1) {
          event.preventDefault();
          selectSuggestion(items[activeSuggestionIndex].textContent);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        hideSuggestions();
        return;
      }
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handlePrimary();
    }
  }

  function show() {
    shell.show();
    textArea.focus();
  }

  const runValidation = debounce(renderPreview, VALIDATION_DEBOUNCE_MS);

  textArea.addEventListener('input', runValidation);
  textArea.addEventListener('keyup', handleAutocomplete);
  textArea.addEventListener('keydown', handleKeyDown);
  textArea.addEventListener('blur', () => {
    window.setTimeout(hideSuggestions, 120);
  });

  primaryButton.addEventListener('click', handlePrimary);
  closeButton.addEventListener('click', close);

  renderPreview();

  return { show, destroy: close };
}

const NOOP_MODAL = { show: () => {}, destroy: () => {} };

/** Open a bulk modal, unless another modal is already open. */
function openBulkModal(mode) {
  if (document.querySelector('.list-modal-backdrop')) return NOOP_MODAL;
  return createBulkCardModal(mode);
}

export const createBulkAddModal = () => openBulkModal('add');
export const createBulkCheckModal = () => openBulkModal('check');
