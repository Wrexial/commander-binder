// src/ui/keyboardShortcuts.js
/**
 * Global keyboard shortcuts. Deliberately small and non-invasive:
 *  - typing in a field is never hijacked;
 *  - arrow keys only move between cards once a card control already has focus,
 *    so they still scroll the page everywhere else;
 *  - everything is ignored while a modal is open.
 */

/** Elements whose typing must not be intercepted. */
function isEditable(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
  );
}

function isModalOpen() {
  // Any dialog owns the keyboard: the app modals and the card preview modal.
  return Boolean(document.querySelector('.list-modal-backdrop, .tooltip.modal'));
}

/** Visible cards in grid order (skips anything hidden by search/filter). */
function visibleCards() {
  return Array.from(document.querySelectorAll('#results .card')).filter((card) => {
    for (let node = card; node; node = node.parentElement) {
      if (node.hidden || node.style?.display === 'none') return false;
    }
    return true;
  });
}

/** The control j/k should land on for a card, or null if the card has none. */
function cardControl(card) {
  return card.querySelector('.card-toggle, .card-versions');
}

/** Move focus to the next (`direction > 0`) or previous visible card. */
function moveCardFocus(direction) {
  const cards = visibleCards();
  if (cards.length === 0) return false;

  const index = cards.findIndex((card) => card.contains(document.activeElement));
  const nextIndex =
    index === -1
      ? direction > 0
        ? 0
        : cards.length - 1
      : Math.min(Math.max(index + direction, 0), cards.length - 1);

  const control = cardControl(cards[nextIndex]);
  if (!control) return false;

  control.focus();
  control.scrollIntoView({ block: 'nearest' });
  return true;
}

function focusSearch() {
  const input = document.getElementById('search-input');
  if (!input) return false;
  input.focus();
  input.select?.();
  return true;
}

function clearSearch() {
  const input = document.getElementById('search-input');
  if (!input || input.value === '') return false;

  const clear = document.getElementById('clear-search');
  if (clear) {
    clear.click();
  } else {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  input.focus();
  return true;
}

function toggleSearchHelp() {
  const help = document.getElementById('search-help');
  if (!help) return false;
  help.click();
  return true;
}

/**
 * Wire the global shortcuts.
 *
 * @param {{target?: Document|HTMLElement}} [options]
 * @returns {() => void} teardown, handy for tests.
 */
export function initKeyboardShortcuts({ target = document } = {}) {
  function onKeyDown(event) {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isModalOpen()) return;

    const editable = isEditable(event.target);

    // Escape clears an active search box.
    if (event.key === 'Escape') {
      if (editable && event.target.id === 'search-input' && clearSearch()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    // "/" focuses search; "?" opens the syntax help. Both are ordinary typing
    // characters in a field, so only act outside one.
    if (!editable && event.key === '/') {
      event.preventDefault();
      focusSearch();
      return;
    }
    if (!editable && event.key === '?') {
      event.preventDefault();
      toggleSearchHelp();
      return;
    }

    if (editable) return;

    if (event.key === 'j') {
      if (moveCardFocus(1)) event.preventDefault();
      return;
    }
    if (event.key === 'k') {
      if (moveCardFocus(-1)) event.preventDefault();
      return;
    }

    // Arrow keys move between cards only once a card control has focus;
    // everywhere else they scroll the page as usual.
    const onACard = event.target instanceof Element && Boolean(event.target.closest('.card'));
    if (!onACard) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      if (moveCardFocus(1)) event.preventDefault();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      if (moveCardFocus(-1)) event.preventDefault();
    }
  }

  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
