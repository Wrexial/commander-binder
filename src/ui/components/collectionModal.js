import { escapeHtml } from '../../utils/html.js';
import { setCardsOwned } from '../../state/cardState.js';
import { setCardsWanted } from '../../state/wishlistState.js';
import { updateAllCardStates } from '../cards.js';
import { updateAllBinderCounts } from '../layout.js';
import { updateOwnedCounter } from './ownedCounter.js';
import { showToast } from './toast.js';
import { createModal } from './modal.js';

/** Case/whitespace-insensitive key used to match a card name. */
export function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

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
  const shell = createModal({ className: 'bulk-modal', ariaLabel: title });
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

/** A labelled `<ul>` of card names in a modal's preview. */
export function previewGroup(status, label, names) {
  if (names.length === 0) return '';

  const rows = names
    .map((name) => `<li class="bulk-row bulk-row-${status}">${escapeHtml(name)}</li>`)
    .join('');

  return `<section class="bulk-group"><h3>${escapeHtml(label)}<span>${names.length}</span></h3><ul>${rows}</ul></section>`;
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
