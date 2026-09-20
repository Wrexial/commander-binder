import { binderColors } from '../config/constants.js';
import { getCardsPerPage, getPagesPerBinder } from '../state/cardSettings.js';
import { appState } from '../state/appState.js';
import { positionTooltip } from './tooltip.js';
import { isHoverCapable } from '../utils/pointer.js';
import { isCardOwned } from '../state/cardState.js';
import { isCardWanted } from '../state/wishlistState.js';
import { getListCards, getLists } from '../state/listsState.js';
import {
  getBinderCards,
  getBinderPrintingIds,
  getBinders,
  getActiveBinderId,
} from '../state/bindersState.js';
import { binderTargetId, listTargetId } from './components/collectionTargets.js';
import { hydrateCardsByIds } from '../api/cardSearch.js';
import { cardStore } from '../state/cardStore.js';
import { showToast } from './components/toast.js';
import { addButtonToSidebar } from './components/sidebar.js';
import { surpriseMe } from './randomCard.js';

/** Long-press duration that distinguishes it from a tap. */
const LONG_PRESS_MS = 500;

/** How long the tapped set-name bubble stays up before fading out. */
const SET_TOOLTIP_TIMEOUT_MS = 2500;

/**
 * Wire the tap and long-press actions of a collapsible header. Exactly one of
 * them runs per gesture: a long press swallows the click that follows it, which
 * would otherwise toggle the header straight back.
 *
 * @param {HTMLElement} element
 * @param {(event: Event) => void} onTap
 * @param {() => void} onLongPress
 */
function attachTapAndLongPress(element, onTap, onLongPress) {
  let timer;
  let longPressed = false;

  const cancel = () => clearTimeout(timer);

  element.addEventListener(
    'touchstart',
    () => {
      longPressed = false;
      timer = setTimeout(() => {
        longPressed = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    { passive: true }
  );
  element.addEventListener('touchend', cancel);
  element.addEventListener('touchmove', cancel);
  // A long press must not also open the native context menu.
  element.addEventListener('contextmenu', (event) => event.preventDefault());

  element.addEventListener('click', (event) => {
    if (longPressed) {
      longPressed = false;
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    onTap(event);
  });
}

let setTooltipTimer;
let setTooltipDismissalBound = false;

/** Hide the set-name bubble (and cancel its auto-hide). */
function hideSetTooltip() {
  clearTimeout(setTooltipTimer);
  const setTooltip = document.getElementById('set-tooltip');
  if (!setTooltip) return;
  setTooltip.textContent = '';
  setTooltip.style.display = 'none';
}

/**
 * Show the set's full name next to a tapped/hovered set code.
 *
 * @param {HTMLElement} chip
 * @param {string} name
 * @param {boolean} autoHide used for taps, which have no matching "leave"
 */
function showSetTooltip(chip, name, autoHide) {
  const setTooltip = document.getElementById('set-tooltip');
  if (!setTooltip) return;

  clearTimeout(setTooltipTimer);
  setTooltip.textContent = name;
  setTooltip.style.display = 'block';

  // Anchor to the chip rather than the pointer, so a tap lands where the finger
  // already is instead of where the synthesized mouse event points.
  const rect = chip.getBoundingClientRect();
  positionTooltip({ clientX: rect.left + rect.width / 2, clientY: rect.top }, setTooltip);

  if (autoHide) setTooltipTimer = setTimeout(hideSetTooltip, SET_TOOLTIP_TIMEOUT_MS);
}

/** Dismiss a tapped bubble on the next tap or scroll (bound once). */
function bindSetTooltipDismissal() {
  if (setTooltipDismissalBound) return;
  setTooltipDismissalBound = true;

  document.addEventListener(
    'touchstart',
    (event) => {
      // Tap on the bubble: let the click below close it, so the press is not
      // also seen as a press on whatever the bubble is covering.
      if (event.target.closest?.('#set-tooltip')) return;
      hideSetTooltip();
    },
    { passive: true }
  );

  // On touch the bubble accepts the tap (see the stylesheet), and it is not a
  // descendant of the header or card behind it, so this is the whole action.
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('#set-tooltip')) return;
    event.stopPropagation();
    hideSetTooltip();
  });

  window.addEventListener('scroll', hideSetTooltip, { passive: true });
}

/** Add / import cards — the combined Bulk Add + Import Collection modal. */
export function createAddCardsButton(onClick) {
  addButtonToSidebar('➕ Add Cards', onClick, 'collection', 10);
}

/** Jump to a random card the collector is missing. */
export function createSurpriseButton() {
  addButtonToSidebar('🎲 Surprise Me', surpriseMe, 'browse', 20);
}

export function createBulkCheckButton(onClick) {
  addButtonToSidebar('✔️ Bulk Check', onClick, 'collection', 20);
}

/** Turn a list name into a safe download-file slug ("Deck: Atraxa" -> "deck-atraxa"). */
function slugify(value) {
  return (
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'list'
  );
}

/** Export the owned collection, the wishlist, any custom list or any binder. */
export function createExportButton() {
  addButtonToSidebar(
    '📄 Export Cards',
    async () => {
      const binders = getBinders();

      // A binder can hold any card, including ones the browse feed never
      // loaded. Fetch those first so the export carries names/sets rather than
      // bare printing ids.
      const missing = binders
        .flatMap((binder) => getBinderPrintingIds(binder.id))
        .filter((id) => !cardStore.getByPrintingId(id));
      if (missing.length > 0) {
        try {
          await hydrateCardsByIds(missing);
        } catch (err) {
          console.error('Failed to load binder cards for export:', err);
        }
      }

      const allCards = cardStore.getAll();
      const collections = [
        {
          id: 'owned',
          label: 'Collection',
          cards: allCards.filter(isCardOwned),
          filePrefix: 'owned-cards',
          noun: 'owned',
          emptyMessage: 'You don’t own any cards yet.',
        },
        {
          id: 'wishlist',
          label: 'Wishlist',
          cards: allCards.filter(isCardWanted),
          filePrefix: 'wishlist',
          noun: 'wanted',
          emptyMessage: 'Your wishlist is empty.',
        },
        // Custom lists are exported exactly like the two built-in collections.
        ...getLists().map((list) => ({
          id: listTargetId(list.id),
          label: `List: ${list.name}`,
          cards: getListCards(list.id),
          filePrefix: `list-${slugify(list.name)}`,
          noun: 'list',
          emptyMessage: `“${list.name}” has no cards yet.`,
        })),
        // Binders export their pockets in page/slot order.
        ...binders.map((binder) => ({
          id: binderTargetId(binder.id),
          label: `Binder: ${binder.name}`,
          cards: getBinderCards(binder.id),
          filePrefix: `binder-${slugify(binder.name)}`,
          noun: 'binder',
          emptyMessage: `“${binder.name}” has no cards yet.`,
        })),
      ];

      if (collections.every((collection) => collection.cards.length === 0)) {
        showToast('Nothing to export yet.');
        return;
      }

      if (document.querySelector('.list-modal-backdrop')) return;

      // On the Binder Builder page, open on the binder that is currently shown.
      const activeBinderId = document.getElementById('binder-root') ? getActiveBinderId() : null;

      const { createExportModal } = await import('./components/exportModal.js');
      createExportModal({
        collections,
        initialId: activeBinderId ? binderTargetId(activeBinderId) : undefined,
      }).show();
    },
    'collection',
    30
  );
}

/** A timeline of recently added owned or wishlist cards. */
export function createRecentActivityButton() {
  addButtonToSidebar(
    '🕒 Recent Additions',
    async () => {
      if (document.querySelector('.list-modal-backdrop')) return;

      const { createRecentActivityModal } = await import('./components/recentActivityModal.js');
      createRecentActivityModal().show();
    },
    'browse',
    30
  );
}

/** Read-only diff between a shared collection and the visitor's own. */
export function createCompareButton() {
  addButtonToSidebar(
    '🔀 Compare Collections',
    async () => {
      if (document.querySelector('.list-modal-backdrop')) return;

      const { showCompareModal } = await import('./components/compareModal.js');
      await showCompareModal();
    },
    'browse',
    40
  );
}

export function startNewBinder(results) {
  const binderNumber = Math.floor(appState.count / (getCardsPerPage() * getPagesPerBinder())) + 1;

  const newBinder = document.createElement('div');
  newBinder.className = 'binder';

  // `binderColors` (config/constants.js) is the single source of truth for the
  // index-based binder palette.
  const color = binderColors[(binderNumber - 1) % binderColors.length];

  newBinder.style.borderColor = color;
  newBinder.style.setProperty('--binder-accent', color);

  const header = document.createElement('h2');
  header.className = 'binder-header';
  header.style.color = color;

  const content = document.createElement('div');
  content.className = 'binder-header-content';

  const title = document.createElement('span');
  title.className = 'binder-title';
  title.textContent = `Binder ${binderNumber}`;
  content.appendChild(title);

  const dates = document.createElement('span');
  dates.className = 'binder-dates';
  content.appendChild(dates);

  const ownedCount = document.createElement('span');
  ownedCount.className = 'binder-owned';
  content.appendChild(ownedCount);

  header.appendChild(content);

  function handleInteraction(event) {
    if (event.shiftKey) {
      toggleAllSections(newBinder);
    } else {
      newBinder.classList.toggle('collapsed');
    }
  }

  function toggleAllSections(binder) {
    const sections = binder.querySelectorAll('.section');
    if (sections.length === 0) return;

    const isBinderOpen = !binder.classList.contains('collapsed');
    const anySectionOpen = Array.from(sections).some((s) => !s.classList.contains('collapsed'));

    const shouldCollapseAll = isBinderOpen && anySectionOpen;

    sections.forEach((section) => {
      section.classList.toggle('collapsed', shouldCollapseAll);
    });

    binder.classList.toggle('collapsed', shouldCollapseAll);
  }

  attachTapAndLongPress(header, handleInteraction, () => toggleAllSections(newBinder));

  newBinder.appendChild(header);
  results.appendChild(newBinder);

  // Keep the infinite-scroll sentinel as the last child so new binders don't
  // push it out of the observed position.
  const sentinel = results.querySelector('#infinite-scroll-sentinel');
  if (sentinel) results.appendChild(sentinel);

  appState.binder = newBinder;
  appState.binder.totalCards = 0;
  appState.binder.ownedCards = 0;
  appState.binder.sectionCount = 0;
  appState.binder.startDate = null;
  appState.binder.endDate = null;
}

export function startNewSection(pageSets = new Map(), { showSets = true } = {}) {
  appState.binder.sectionCount = (appState.binder.sectionCount || 0) + 1;
  const pageNumberInBinder = appState.binder.sectionCount;

  const section = document.createElement('div');
  section.className = 'section';
  appState.section = section;

  const header = document.createElement('h3');
  header.className = 'page-header';
  // Set tags are only meaningful in release order; a sorted grid mixes sets.
  header.textContent = showSets ? `Page ${pageNumberInBinder} — ` : `Page ${pageNumberInBinder}`;

  const toggleSection = () => section.classList.toggle('collapsed');
  attachTapAndLongPress(header, toggleSection, toggleSection);

  bindSetTooltipDismissal();

  if (showSets) {
    const setCodes = Array.from(pageSets.entries()).map(([setCode, setObj]) => {
      const span = document.createElement('span');
      span.textContent = setCode.toUpperCase();
      span.style.cursor = 'help';

      // Pointer devices get a hover preview; touch gets the same bubble from a
      // single tap, which is swallowed so the section does not also collapse.
      span.addEventListener('mouseenter', (event) => {
        if (!isHoverCapable()) return;
        showSetTooltip(span, setObj.name, false);
        const setTooltip = document.getElementById('set-tooltip');
        if (setTooltip) positionTooltip(event, setTooltip);
      });
      span.addEventListener('mousemove', (event) => {
        if (!isHoverCapable()) return;
        const setTooltip = document.getElementById('set-tooltip');
        if (setTooltip?.style.display === 'block') positionTooltip(event, setTooltip);
      });
      span.addEventListener('mouseleave', () => {
        if (!isHoverCapable()) return;
        hideSetTooltip();
      });

      span.addEventListener('click', (event) => {
        if (isHoverCapable()) return;
        event.stopPropagation();
        event.preventDefault();
        showSetTooltip(span, setObj.name, true);
      });

      return span;
    });

    setCodes.forEach((span, index) => {
      header.appendChild(span);
      if (index < setCodes.length - 1) {
        header.appendChild(document.createTextNode(', '));
      }
    });
  }

  appState.grid = document.createElement('div');
  appState.grid.className = 'grid';

  appState.section.appendChild(header);
  appState.section.appendChild(appState.grid);
  appState.binder.appendChild(appState.section);
}

export function updateBinderCounts(binder) {
  if (!binder) return;
  const binderOwnedEl = binder.querySelector('.binder-owned');
  if (binderOwnedEl) {
    binderOwnedEl.textContent = `Owned: ${binder.ownedCards || 0}/${binder.totalCards || 0}`;
  }
}

// Adjust an owned-card counter without rescanning the binder. Used by toggles.
export function adjustBinderOwnedCount(binder, delta) {
  if (!binder) return;
  binder.ownedCards = Math.max(0, (binder.ownedCards || 0) + delta);
  updateBinderCounts(binder);
}

// Recompute a binder's counters from the DOM. Only needed for bulk operations.
export function recountBinder(binder) {
  if (!binder) return;
  binder.totalCards = binder.querySelectorAll('.card').length;
  binder.ownedCards = binder.querySelectorAll('.card.owned').length;
  updateBinderCounts(binder);
}

export function updateAllBinderCounts() {
  document.querySelectorAll('.binder').forEach(recountBinder);
}
