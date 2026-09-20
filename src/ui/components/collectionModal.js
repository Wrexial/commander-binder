import { escapeHtml } from '../../utils/html.js';
import { setCardsOwned } from '../../state/cardState.js';
import { setCardsWanted } from '../../state/wishlistState.js';
import { updateAllCardStates } from '../cards.js';
import { updateAllBinderCounts } from '../layout.js';
import { updateOwnedCounter } from './ownedCounter.js';
import { showToast } from './toast.js';
import { createModal } from './modal.js';
import { hideCardPreview } from './cardPreview.js';
import { COLLECTION_TARGETS } from './collectionTargets.js';

/** Case/whitespace-insensitive key used to match a card name. */
export function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

/** Unique id per target picker, so its disclosure button can reference its list. */
let targetToggleSeq = 0;

/**
 * Shared chrome for the "collection text" modals (bulk add/check, import,
 * export): the titled header, the content area and the button row, appended to
 * the modal in the order the CSS expects. Each modal only builds its own body.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.subtitle
 * @param {Array<{id: string, text?: string, className?: string}>} options.actions
 * @returns {{
 *   shell: {show: () => void},
 *   close: () => void,
 *   contentArea: HTMLElement,
 *   buttons: Record<string, HTMLButtonElement>,
 * }}
 */
export function createCollectionModal({ title, subtitle, actions }) {
  // The rows inside these modals can open a floating card preview; make sure it
  // is torn down when the dialog closes (the hovered row disappears first).
  const shell = createModal({
    className: 'bulk-modal',
    ariaLabel: title,
    onClose: hideCardPreview,
  });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';

  const heading = document.createElement('h2');
  heading.textContent = title;

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'bulk-modal-subtitle';
  subtitleEl.textContent = subtitle;

  header.append(heading, subtitleEl);

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-content-area bulk-content';

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-button-container';

  const buttons = {};
  for (const { id, text = '', className = '' } of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    if (className) button.className = className;
    button.textContent = text;
    buttons[id] = button;
    buttonContainer.append(button);
  }

  modal.append(header, contentArea, buttonContainer);

  return { shell, close, contentArea, buttons };
}

/** A small coloured count chip shown in a modal's preview summary. */
export function summaryChip(status, label, count) {
  return `<span class="bulk-summary-chip bulk-chip-${status}">${escapeHtml(label)} <strong>${count}</strong></span>`;
}

/**
 * A labelled `<ul>` of card names in a modal's preview. Entries may be plain
 * strings (non-interactive) or `{name, id, locations?}` / card objects, in which
 * case the row opts into a hover/tap preview (see `attachCardPreview`). A
 * `locations` array renders as membership badges (used by Bulk Check).
 */
export function previewGroup(status, label, entries) {
  if (entries.length === 0) return '';

  const rows = entries
    .map((entry) => {
      const name = typeof entry === 'string' ? entry : entry.name;
      const id = typeof entry === 'string' ? '' : entry.id || '';
      const locations = typeof entry === 'string' ? [] : entry.locations || [];
      const preview = id ? ` data-card-preview data-card-id="${escapeHtml(id)}"` : '';
      const locationHtml = locations.length
        ? `<span class="bulk-row-locations">${locations
            .map(
              (location) =>
                `<span class="bulk-location bulk-location-${escapeHtml(
                  location.kind || 'list'
                )}">${escapeHtml(location.label)}</span>`
            )
            .join('')}</span>`
        : '';
      return `<li class="bulk-row bulk-row-${status}"${preview}><span class="bulk-row-name">${escapeHtml(
        name
      )}</span>${locationHtml}</li>`;
    })
    .join('');

  return `<section class="bulk-group"><h3>${escapeHtml(label)}<span>${entries.length}</span></h3><ul>${rows}</ul></section>`;
}

/**
 * Mark every card owned, refresh the page chrome and report via a toast. Shared
 * by the bulk-add and import flows, which differ only in their copy.
 *
 * @param {object[]} cards
 * @param {string} successMessage
 */
export async function addOwnedCards(cards, successMessage) {
  await setCardsOwned(cards, true);
  showToast(successMessage, 'success');
  updateAllCardStates();
  updateAllBinderCounts();
  updateOwnedCounter();
}

/**
 * Mark every card wanted and refresh the tiles. The wishlist has no binder
 * counters of its own, so syncing the card states is all the chrome needs.
 *
 * @param {object[]} cards
 * @param {string} successMessage
 */
export async function addWantedCards(cards, successMessage) {
  await setCardsWanted(cards, true);
  showToast(successMessage, 'success');
  updateAllCardStates();
}

/**
 * A small Owned / Wishlist segmented control shared by the collection modals,
 * so the picker and the action always agree on the active target. Optional
 * `actions` render after the targets as "+ New …" buttons (they are never
 * themselves selectable targets).
 *
 * @param {{
 *   options?: {id: string, label: string}[],
 *   initial?: string,
 *   onChange: (id: string) => void,
 *   actions?: {id: string, label: string, onClick: () => void}[],
 * }} config
 * @returns {{
 *   el: HTMLElement,
 *   getValue: () => string,
 *   addOption: (option: {id: string, label: string}) => void,
 *   setValue: (id: string) => void,
 *   expand: () => void,
 *   collapse: () => void,
 * }}
 */
export function createTargetToggle({
  options = COLLECTION_TARGETS,
  initial = 'owned',
  onChange,
  actions = [],
} = {}) {
  const group = document.createElement('div');
  group.className = 'target-toggle';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Target');

  const optionsId = `target-toggle-options-${++targetToggleSeq}`;

  // A compact summary of the active target is all that shows when collapsed;
  // the full chip list can be long (many lists/binders), especially on phones.
  const summary = document.createElement('button');
  summary.type = 'button';
  summary.className = 'target-toggle-summary';
  summary.setAttribute('aria-expanded', 'false');
  summary.setAttribute('aria-controls', optionsId);

  const currentLabel = document.createElement('span');
  currentLabel.className = 'target-toggle-current';

  const chevron = document.createElement('span');
  chevron.className = 'target-toggle-chevron';
  chevron.setAttribute('aria-hidden', 'true');

  summary.append(currentLabel, chevron);

  // The options wrap onto as many rows as needed so every target stays visible
  // (and reachable) no matter how many custom lists and binders exist.
  const optionsRow = document.createElement('div');
  optionsRow.className = 'target-toggle-options';
  optionsRow.id = optionsId;
  optionsRow.hidden = true;

  const buttons = new Map();
  const actionButtons = [];
  let value = initial;
  let expanded = false;

  function syncSummary() {
    const button = buttons.get(value);
    currentLabel.textContent = button ? button.textContent : 'Select target';
    summary.setAttribute('aria-label', `Change target: ${currentLabel.textContent}`);
  }

  function setExpanded(next) {
    expanded = next;
    optionsRow.hidden = !expanded;
    group.classList.toggle('is-expanded', expanded);
    summary.setAttribute('aria-expanded', String(expanded));
  }

  function sync() {
    for (const [id, button] of buttons) {
      button.setAttribute('aria-pressed', String(id === value));
    }
    syncSummary();
  }

  summary.addEventListener('click', () => setExpanded(!expanded));

  function makeOption(option) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'target-toggle-option';
    button.textContent = option.label;
    button.title = option.label;
    button.addEventListener('click', () => {
      const changed = option.id !== value;
      value = option.id;
      sync();
      // Choosing a target closes the list again, so the modal stays compact.
      setExpanded(false);
      if (changed) onChange(option.id);
    });
    return button;
  }

  for (const option of options) {
    const button = makeOption(option);
    optionsRow.appendChild(button);
    buttons.set(option.id, button);
  }

  // "+ New …" actions stay after the selectable targets and are styled as
  // actions rather than one of the chips.
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'target-toggle-option target-toggle-new';
    button.dataset.action = action.id;
    button.textContent = action.label;
    button.addEventListener('click', () => action.onClick());
    optionsRow.appendChild(button);
    actionButtons.push(button);
  }
  group.append(summary, optionsRow);

  sync();

  return {
    el: group,
    getValue: () => value,
    /** Append a newly created target (keeping the "+ New" actions last). */
    addOption(option) {
      if (buttons.has(option.id)) return;
      const button = makeOption(option);
      if (actionButtons[0]) optionsRow.insertBefore(button, actionButtons[0]);
      else optionsRow.appendChild(button);
      buttons.set(option.id, button);
      sync();
    },
    setValue(id) {
      value = id;
      sync();
      setExpanded(false);
    },
    expand: () => setExpanded(true),
    collapse: () => setExpanded(false),
  };
}
