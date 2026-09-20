// src/ui/components/tour.js
/**
 * A lightweight first-run product tour. It dims the page with a spotlight over
 * one element at a time and shows a small popover with the explanation.
 *
 * Deliberately dependency-free and defensive: a step whose anchor is missing is
 * skipped, and the tour can always be finished with Skip or Escape. Completion
 * is remembered in `state/onboarding.js`, and the sidebar's "App Tour" entry
 * replays it on demand.
 */
import { isTourDone, markTourDone } from '../../state/onboarding.js';

/** Breathing room between the spotlight ring and the highlighted element. */
const SPOTLIGHT_PADDING = 8;
/** Space between the target and the popover. */
const POPOVER_GAP = 14;
/** Never let the popover touch a viewport edge. */
const VIEWPORT_MARGIN = 12;

/** The currently running tour, so a replay replaces rather than stacks. */
let activeTour = null;

/** True when an element (or an ancestor) is not rendered. */
function isHidden(element) {
  for (let node = element; node instanceof HTMLElement; node = node.parentElement) {
    if (node.hidden) return true;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }
  return false;
}

function resolveTarget(step) {
  if (!step?.target) return null;
  const element = typeof step.target === 'function' ? step.target() : step.target;
  if (!element || !element.isConnected) return null;
  // A hidden anchor (e.g. the binder editor's edit controls in a share view)
  // would otherwise get a zero-size spotlight; skip it instead.
  return isHidden(element) ? null : element;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Place the popover below, above or centered on the spotlight. */
function positionPopover(popover, rect) {
  const { width, height } = popover.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top;
  if (rect.bottom + POPOVER_GAP + height <= vh - VIEWPORT_MARGIN) {
    top = rect.bottom + POPOVER_GAP;
  } else if (rect.top - POPOVER_GAP - height >= VIEWPORT_MARGIN) {
    top = rect.top - POPOVER_GAP - height;
  } else {
    top = clamp((vh - height) / 2, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, vh - height));
  }

  const left = clamp(
    rect.left + rect.width / 2 - width / 2,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN)
  );

  popover.style.top = `${Math.round(top)}px`;
  popover.style.left = `${Math.round(left)}px`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Run a guided tour.
 *
 * @param {{target: (() => Element|null)|Element, title: string, body?: string}[]} steps
 * @param {{onFinish?: () => void}} [options]
 * @returns {{destroy: () => void}}
 */
export function startTour(steps, { onFinish } = {}) {
  if (activeTour) activeTour.destroy();

  const list = (steps || []).filter((step) => step && step.title);
  const returnFocusTo = document.activeElement;

  const overlay = element('div', 'tour-overlay');
  const spotlight = element('div', 'tour-spotlight');
  const popover = element('div', 'tour-popover');
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-modal', 'true');
  popover.tabIndex = -1;
  document.body.append(overlay, spotlight, popover);

  let index = 0;
  let currentTarget = null;
  let destroyed = false;

  function finish() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    overlay.remove();
    spotlight.remove();
    popover.remove();
    activeTour = null;
    if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) returnFocusTo.focus();
    onFinish?.();
  }

  function reposition() {
    if (!currentTarget || !currentTarget.isConnected) return;
    placeSpotlight(currentTarget);
  }

  function placeSpotlight(target) {
    const rect = target.getBoundingClientRect();
    const padded = {
      top: rect.top - SPOTLIGHT_PADDING,
      left: rect.left - SPOTLIGHT_PADDING,
      width: rect.width + SPOTLIGHT_PADDING * 2,
      height: rect.height + SPOTLIGHT_PADDING * 2,
    };
    padded.bottom = padded.top + padded.height;
    padded.right = padded.left + padded.width;

    spotlight.style.top = `${Math.round(padded.top)}px`;
    spotlight.style.left = `${Math.round(padded.left)}px`;
    spotlight.style.width = `${Math.round(padded.width)}px`;
    spotlight.style.height = `${Math.round(padded.height)}px`;
    positionPopover(popover, padded);
  }

  function step() {
    const current = list[index];
    const target = resolveTarget(current);
    if (!target) {
      if (index < list.length - 1) {
        index += 1;
        step();
      } else {
        finish();
      }
      return;
    }
    currentTarget = target;

    // Bring an off-screen anchor into view before measuring it. Instant, so the
    // popover lands in the right place on the first paint.
    const rect = target.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      target.scrollIntoView?.({ block: 'center' });
    }

    renderPopover(current);
    placeSpotlight(target);
    popover.querySelector('.tour-next')?.focus();
  }

  function renderPopover(current) {
    popover.replaceChildren();

    const dots = element('div', 'tour-dots');
    dots.setAttribute('aria-hidden', 'true');
    list.forEach((_, i) => {
      const dot = element('span', `tour-dot${i === index ? ' is-active' : ''}`);
      dots.appendChild(dot);
    });

    const title = element('h2', 'tour-title', current.title);
    title.id = 'tour-title';
    const body = element('p', 'tour-body', current.body || '');
    body.id = 'tour-body';

    const actions = element('div', 'tour-actions');
    const skip = element('button', 'tour-skip', 'Skip');
    skip.type = 'button';
    skip.addEventListener('click', finish);

    const nav = element('div', 'tour-nav');
    const back = element('button', 'tour-back', 'Back');
    back.type = 'button';
    back.disabled = index === 0;
    back.addEventListener('click', () => go(-1));

    const next = element(
      'button',
      'tour-next primary',
      index === list.length - 1 ? 'Done' : 'Next'
    );
    next.type = 'button';
    next.addEventListener('click', () => go(1));

    nav.append(back, next);
    actions.append(skip, nav);
    popover.append(dots, title, body, actions);
    popover.setAttribute('aria-labelledby', 'tour-title');
    popover.setAttribute('aria-describedby', 'tour-body');
  }

  function go(direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0) return;
    if (nextIndex >= list.length) {
      finish();
      return;
    }
    index = nextIndex;
    step();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
      return;
    }
    if (event.key !== 'Tab') return;

    // Keep focus inside the popover while the tour is up.
    const items = [...popover.querySelectorAll('button:not([disabled])')];
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', reposition);
  // Capture scrolls from any scroll container (the grid scrolls the window, the
  // statistics-style containers scroll internally).
  window.addEventListener('scroll', reposition, true);

  // Register before the first step: a step that immediately finds no anchor may
  // finish synchronously, which clears `activeTour` again.
  const tour = { destroy: finish };
  activeTour = tour;
  step();

  return activeTour === tour ? tour : null;
}

/** The default browse-page tour. Anchors are resolved lazily, so it is safe to
 *  call before the grid has rendered (missing steps are skipped). */
const DEFAULT_STEPS = [
  {
    target: () => document.getElementById('search-wrapper'),
    title: 'Search the grid',
    body: 'Find a legendary creature by name — or use syntax like c:W, r:mythic or is:owned. Tap the ? for the full cheat sheet.',
  },
  {
    target: () => document.getElementById('filter-toggle'),
    title: 'Filter & sort',
    body: 'Narrow the grid by colour, rarity, set, price or collection lens, and reorder it however you like.',
  },
  {
    target: () => document.querySelector('#results .card'),
    title: 'Track a card',
    body: 'Tap a card to mark it owned, or long-press for a full preview. The heart adds it to your wishlist instead.',
  },
  {
    target: () => document.getElementById('openbtn'),
    title: 'All your tools',
    body: 'Add Cards, Lists, Binders, Statistics and Sharing live in the menu. Open it any time with this button.',
  },
];

/** The Binder Builder page's tour. Anchors only exist after the editor mounts,
 *  so missing steps are skipped while it is still loading. */
const BINDER_STEPS = [
  {
    target: () => document.querySelector('.binder-tabs'),
    title: 'Your binders',
    body: 'Each tab is one physical binder. Tap a tab to switch, or use “+ New” to start another.',
  },
  {
    target: () => document.querySelector('.binder-builder-toolbar'),
    title: 'Name, size & sharing',
    body: 'Rename the binder, set its columns, rows and pages, mark it public for your share link, or delete it. Resizing shifts cards instead of dropping them.',
  },
  {
    target: () => document.querySelector('.binder-builder-nav'),
    title: 'Page through the binder',
    body: 'Move between pages with Prev/Next, or clear the page you are on.',
  },
  {
    target: () => document.querySelector('#binder-root .binder-page'),
    title: 'Fill the pockets',
    body: 'Tap an empty pocket to search for a card. Use ⇄ to move a pocket’s card and ✕ to empty it — a card tap still marks it owned.',
  },
  {
    target: () => document.getElementById('openbtn'),
    title: 'All your tools',
    body: 'Statistics for this binder, sharing, settings and the rest of your collection live in the menu.',
  },
];

/** True on the Binder Builder page (it mounts the editor into `#binder-root`). */
function isBinderPage() {
  return Boolean(document.getElementById('binder-root'));
}

/** The steps and completion flag that match the page the app is on. */
function currentTour() {
  return isBinderPage()
    ? { id: 'binder', steps: BINDER_STEPS }
    : { id: 'browse', steps: DEFAULT_STEPS };
}

/**
 * Start the page's first-run tour unless it has already been completed. Pass
 * `{ force: true }` to replay it from the sidebar.
 */
export function startFirstRunTour({ force = false } = {}) {
  const { id, steps } = currentTour();
  if (!force && isTourDone(id)) return null;
  return startTour(steps, { onFinish: () => markTourDone(id) });
}
