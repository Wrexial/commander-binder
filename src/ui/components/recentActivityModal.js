import { getOwnedAddedAt } from '../../state/cardState.js';
import { getWantedAddedAt } from '../../state/wishlistState.js';
import { cardStore, primaryName } from '../../state/cardStore.js';
import { escapeHtml } from '../../utils/html.js';
import { createModal } from './modal.js';
import { createTargetToggle } from './collectionModal.js';

/** Cap the list so a huge collection can't build thousands of rows. */
const MAX_ENTRIES = 100;

/**
 * Human-friendly "added" time. Falls back to a locale date past a week.
 *
 * @param {string} isoString
 * @param {number} [now]
 * @returns {string}
 */
export function formatAddedAt(isoString, now = Date.now()) {
  const then = Date.parse(isoString);
  if (Number.isNaN(then)) return '';

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString();
}

/**
 * The most recently added cards, newest first and de-duplicated by name (a card
 * can have several printings). Entries whose card isn't in the store yet are
 * skipped.
 *
 * @param {Map<string, string>} [addedAt]
 * @param {number} [limit]
 * @returns {{card: object, createdAt: string}[]}
 */
export function recentAdditions(addedAt = getOwnedAddedAt(), limit = MAX_ENTRIES) {
  const rows = [];
  for (const [cardId, createdAt] of addedAt) {
    const card = cardStore.getByPrintingId(cardId);
    if (card) rows.push({ card, createdAt: String(createdAt) });
  }

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const name = primaryName(row.card);
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

/**
 * Create the combined "Recent Additions" modal — a timeline of when cards were
 * marked owned or wanted, switchable with the target picker. Cards added before
 * `created_at` existed still appear, but only once the migration has run.
 *
 * @param {{kind?: 'owned'|'wishlist'}} [options] Initial target.
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createRecentActivityModal({ kind = 'owned' } = {}) {
  let active = kind === 'wishlist' ? 'wishlist' : 'owned';

  const shell = createModal({ className: 'activity-modal', ariaLabel: 'Recent Additions' });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';

  const heading = document.createElement('h2');
  const subtitle = document.createElement('p');
  subtitle.className = 'bulk-modal-subtitle';

  const target = createTargetToggle({
    initial: active,
    onChange: (next) => {
      active = next;
      renderList();
    },
  });

  header.append(heading, subtitle, target.el);

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-content-area activity-content';

  function renderList() {
    const isWishlist = active === 'wishlist';
    const verb = isWishlist ? 'wanted' : 'owned';
    const entries = recentAdditions(isWishlist ? getWantedAddedAt() : getOwnedAddedAt());

    heading.textContent = isWishlist ? 'Recent Wishlist Additions' : 'Recent Additions';
    subtitle.textContent = entries.length
      ? `Your ${entries.length} most recently ${verb} card${entries.length === 1 ? '' : 's'}.`
      : `Cards you mark as ${verb} show up here.`;

    if (entries.length === 0) {
      contentArea.innerHTML = `<p class="bulk-empty">Nothing added yet. Mark cards as ${verb} and they will appear here.</p>`;
      return;
    }

    contentArea.innerHTML = `<ul class="activity-list">${entries
      .map(
        (entry) => `
          <li class="activity-row">
            <span class="activity-name">${escapeHtml(entry.card.name)}</span>
            <span class="activity-set">${escapeHtml((entry.card.set || '').toUpperCase())}</span>
            <span class="activity-time">${escapeHtml(formatAddedAt(entry.createdAt))}</span>
          </li>`
      )
      .join('')}</ul>`;
  }

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-button-container';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', close);
  buttonContainer.appendChild(closeButton);

  modal.append(header, contentArea, buttonContainer);

  renderList();

  function show() {
    shell.show();
    closeButton.focus();
  }

  return { show, destroy: close };
}
