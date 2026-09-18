// src/ui/yearScrubber.js
//
// A draggable timeline rail pinned to the right edge of the viewport. The thumb
// tracks the scroll position, dragging it scrubs the collection, and a floating
// label names the mark the thumb is over: the release year (plus the sets on
// that page) in the default order, or the sort value (letter / price / rarity …)
// for a sorted grid.
//
// Cards are rendered in order (see `cardFeed.js`), so the section elements *are*
// the timeline. Marks are recomputed from the first *visible* card of each
// section for the active sort, so they follow both sorting and filtering; a
// section's `data-mark`/`data-mark-sets` stamps are the fallback when no cards
// are rendered.
import { filters } from '../state/filters.js';
import { isDefaultSort, sortMark } from '../utils/sortCards.js';

/** Space above a section when a year is jumped to (binder header + margins). */
const STICKY_HEADER_ALLOWANCE = 56;

/** Idle time before the year label hides itself again. */
const LABEL_HIDE_DELAY_MS = 900;

/** A pause longer than this ends the current scroll burst. */
const SCROLL_BURST_GAP_MS = 250;

/** Distance (in viewports) within one burst that counts as scrolling fast. */
const FAST_SCROLL_VIEWPORTS = 0.6;

/** Above this many year marks the tick marks become noise. */
const MAX_TICKS = 60;

/** How often the (expensive) document height is re-measured during scrolling. */
const OVERFLOW_REMEASURE_MS = 250;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** The document's largest scroll offset (0 when nothing overflows). */
export function maxScrollTop() {
  const doc = document.scrollingElement || document.documentElement;
  return Math.max(0, doc.scrollHeight - window.innerHeight);
}

function markLabel(section) {
  if (section.dataset.mark) return section.dataset.mark;
  const year = Number(section.dataset.year);
  return Number.isFinite(year) ? String(year) : '';
}

/** The first card in a section that the active filter is not hiding. */
function firstVisibleCard(section) {
  for (const card of section.querySelectorAll('.card')) {
    if (card.style.display !== 'none') return card;
  }
  return null;
}

/** Uppercased set codes of a section's visible cards, for the release sort. */
function visibleSetCodes(section) {
  const codes = new Set();
  for (const card of section.querySelectorAll('.card')) {
    if (card.style.display === 'none') continue;
    const code = card.cardData?.set;
    if (code) codes.add(code.toUpperCase());
  }
  return [...codes].join(', ');
}

/**
 * One mark per visible section, in document order. A mark's label is the active
 * sort's value for the section's first visible card (release year, letter,
 * price, colour name, …); its sets are listed for the default release order.
 *
 * @param {ParentNode} [root]
 * @returns {{label: string, sets: string, top: number, section: Element}[]}
 */
export function buildMarks(root = document) {
  const marks = [];

  for (const section of root.querySelectorAll('.section')) {
    // A filtered-out section is not part of the visible timeline.
    if (section.style.display === 'none') continue;

    const firstCard = firstVisibleCard(section);
    let label;
    let sets;

    if (firstCard?.cardData) {
      // The first visible card drives the mark, so it tracks filtering and the
      // active sort instead of the order the page happened to render in.
      label = sortMark(firstCard.cardData, filters.sort);
      sets = isDefaultSort(filters.sort) ? visibleSetCodes(section) : '';
    } else {
      // No rendered cards (tests, or a section mid-render): use the stamps.
      label = markLabel(section);
      sets = section.dataset.markSets ?? section.dataset.sets ?? '';
    }

    if (!label) continue;
    marks.push({ label, sets, section });
  }

  for (const mark of marks) {
    mark.top = Math.round(mark.section.getBoundingClientRect().top + window.scrollY);
  }

  return marks;
}

/**
 * Keep only the first of each run of same-labelled marks. The rail draws ticks
 * at these and the keyboard steps between them; the label itself reads from the
 * full per-section list, so its sets follow the section under the thumb.
 *
 * @param {{label: string, top: number}[]} marks
 * @returns {{label: string, top: number}[]}
 */
export function labelMarks(marks) {
  const out = [];
  let last = null;
  for (const mark of marks) {
    if (mark.label === last) continue;
    last = mark.label;
    out.push(mark);
  }
  return out;
}

/**
 * The last mark at or before `offset` — i.e. the mark the reader is looking at.
 *
 * @param {{label: string, top: number}[]} marks
 * @param {number} offset
 * @returns {{label: string, top: number}|null}
 */
export function markAtOffset(marks, offset) {
  if (marks.length === 0) return null;

  let low = 0;
  let high = marks.length - 1;
  let found = marks[0];

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (marks[mid].top <= offset) {
      found = marks[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}

/** How much room the sticky bars take from the top of the viewport. */
function stickyOffset() {
  const setting = getComputedStyle(document.documentElement).getPropertyValue(
    '--card-settings-height'
  );
  return (parseFloat(setting) || 0) + STICKY_HEADER_ALLOWANCE;
}

/**
 * Create the rail and keep it in sync. Safe to call once; returns a teardown.
 *
 * @returns {() => void}
 */
export function initYearScrubber() {
  const existing = document.getElementById('year-scrubber');
  if (existing) return () => existing.remove();

  const rail = document.createElement('div');
  rail.id = 'year-scrubber';
  rail.className = 'year-scrubber';
  rail.tabIndex = 0;
  rail.setAttribute('role', 'slider');
  rail.setAttribute('aria-orientation', 'vertical');
  rail.setAttribute('aria-label', 'Collection timeline');

  const track = document.createElement('div');
  track.className = 'year-scrubber-track';

  const ticks = document.createElement('div');
  ticks.className = 'year-scrubber-ticks';

  const thumb = document.createElement('div');
  thumb.className = 'year-scrubber-thumb';

  const label = document.createElement('div');
  label.className = 'year-scrubber-label';
  label.setAttribute('aria-hidden', 'true');

  const yearEl = document.createElement('span');
  yearEl.className = 'year-scrubber-year';

  const setsEl = document.createElement('span');
  setsEl.className = 'year-scrubber-sets';

  label.append(yearEl, setsEl);
  track.append(ticks, thumb, label);
  rail.append(track);
  document.body.append(rail);

  // The rail is pinned just below where the toolbar *sticks*, so it must not
  // appear while the toolbar is still in flow under the page header — there it
  // would overlap the header/toolbar and be hidden behind them. `stickAt` is the
  // document offset at which the toolbar reaches the top of the viewport; the
  // rail only shows from there down. When there is no toolbar to measure, it
  // falls back to always-visible (the previous behaviour).
  const settingsEl = document.getElementById('card-settings');
  let stickAt = 0;

  function measureStickAt() {
    if (!settingsEl) return;
    const rect = settingsEl.getBoundingClientRect();
    // Once stuck, `rect.top + scrollY` grows with the page; only trust a
    // measurement taken while the bar is still in normal flow.
    if (rect.top > 1) stickAt = Math.round(rect.top + window.scrollY);
  }

  /** @type {{sections: ReturnType<typeof buildMarks>, marks: ReturnType<typeof buildMarks>, travel: number, max: number}} */
  const state = { sections: [], marks: [], travel: 1, max: 0 };
  let dragging = false;
  let grabOffset = 0;
  let frame = 0;
  let hideTimer = 0;
  // Speed sampling for "skimmed past a year" feedback while scrolling normally.
  let burstDistance = 0;
  let lastScrollY = window.scrollY;
  let lastScrollAt = 0;
  // Change guards: scrolling must not write to the DOM every frame for nothing.
  let lastThumbY = -1;
  let lastVisible = null;
  let lastLabelKey = '';
  let lastAriaKey = '';
  let lastTickKey = '';
  let lastMeasureAt = 0;

  // --- rendering -----------------------------------------------------------

  function thumbTravel() {
    const trackHeight = track.getBoundingClientRect().height;
    const thumbHeight = thumb.getBoundingClientRect().height;
    return Math.max(1, trackHeight - thumbHeight);
  }

  function renderTicks() {
    const key = `${state.marks.length}:${Math.round(state.max)}`;
    if (key === lastTickKey) return;
    lastTickKey = key;

    if (state.marks.length < 2 || state.marks.length > MAX_TICKS || state.max <= 0) {
      ticks.textContent = '';
      return;
    }

    ticks.textContent = '';
    const documentHeight = state.max + window.innerHeight;
    for (const mark of state.marks) {
      const notch = document.createElement('i');
      notch.style.top = `${clamp(mark.top / documentHeight, 0, 1) * 100}%`;
      ticks.append(notch);
    }
  }

  function renderLabel(offset) {
    const mark = markAtOffset(state.sections, offset);
    const key = mark ? `${mark.label}|${mark.sets}` : '';
    if (key === lastLabelKey) return;
    lastLabelKey = key;

    yearEl.textContent = mark ? mark.label : '';
    setsEl.textContent = mark ? mark.sets : '';
    setsEl.hidden = !mark?.sets;
  }

  function syncAria() {
    if (state.marks.length === 0) return;

    const current = markAtOffset(state.marks, window.scrollY);
    const index = current ? state.marks.indexOf(current) : 0;
    const key = `${state.marks.length}|${index}`;
    if (key === lastAriaKey) return;
    lastAriaKey = key;

    // Position is the mark index; the readable label lives in aria-valuetext,
    // so this works for years, letters, prices, rarities, … alike.
    rail.setAttribute('aria-valuemin', '0');
    rail.setAttribute('aria-valuemax', String(Math.max(0, state.marks.length - 1)));
    rail.setAttribute('aria-valuenow', String(index));
    rail.setAttribute(
      'aria-valuetext',
      current ? `${current.label}${current.sets ? ` — ${current.sets}` : ''}` : ''
    );
  }

  function update() {
    frame = 0;

    // `scrollHeight` forces a layout flush, and the collection keeps growing
    // while you scroll, so re-measure a few times a second rather than per frame.
    const now = performance.now();
    if (now - lastMeasureAt >= OVERFLOW_REMEASURE_MS) {
      lastMeasureAt = now;
      state.max = maxScrollTop();
    }

    const ratio = state.max > 0 ? clamp(window.scrollY / state.max, 0, 1) : 0;
    const y = Math.round(ratio * state.travel);

    if (y !== lastThumbY) {
      lastThumbY = y;
      thumb.style.transform = `translateY(${y}px)`;
      // Percentages in a translate resolve against the element's own size, so
      // this centres the (taller) label on the thumb.
      label.style.transform = `translateY(calc(${y}px - 50%))`;
    }

    const visible = state.max > 0 && state.marks.length > 0 && window.scrollY >= stickAt - 2;
    if (visible !== lastVisible) {
      lastVisible = visible;
      rail.classList.toggle('is-visible', visible);
    }

    // Both of these bail out unless the year actually changed, so the per-frame
    // cost is a binary search, not a DOM write.
    renderLabel(window.scrollY);
    syncAria();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  /** Re-read the timeline. Called when content may have been appended. */
  function refresh() {
    state.sections = buildMarks();
    state.marks = labelMarks(state.sections);
    state.travel = thumbTravel();
    state.max = maxScrollTop();
    measureStickAt();
    renderTicks();
    update();
  }

  function showLabel() {
    clearTimeout(hideTimer);
    // Read the position now: the label can appear from a scroll event, before
    // the next animation frame would have refreshed it.
    renderLabel(window.scrollY);
    rail.classList.add('is-active');
  }

  function hideLabelSoon() {
    clearTimeout(hideTimer);
    if (dragging) return;
    hideTimer = setTimeout(() => rail.classList.remove('is-active'), LABEL_HIDE_DELAY_MS);
  }

  /**
   * Reveal the readout when the reader is skimming rather than nudging. Speed is
   * measured as distance covered inside one continuous scroll burst, because a
   * slow wheel notch and a fast flick send identical-looking single events.
   */
  function noteScrollSpeed() {
    const now = performance.now();
    const y = window.scrollY;
    const paused = now - lastScrollAt > SCROLL_BURST_GAP_MS;

    burstDistance = paused ? 0 : burstDistance + Math.abs(y - lastScrollY);
    lastScrollY = y;
    lastScrollAt = now;

    if (burstDistance >= Math.max(320, window.innerHeight * FAST_SCROLL_VIEWPORTS)) {
      burstDistance = 0;
      showLabel();
    }

    // Keep the readout up for as long as the reader keeps moving.
    if (rail.classList.contains('is-active')) hideLabelSoon();
  }

  // --- scrolling -----------------------------------------------------------

  function ratioFromClientY(clientY) {
    const rect = track.getBoundingClientRect();
    const thumbHeight = thumb.getBoundingClientRect().height;
    const travel = Math.max(1, rect.height - thumbHeight);
    return clamp((clientY - grabOffset - rect.top - thumbHeight / 2) / travel, 0, 1);
  }

  function scrollToRatio(ratio) {
    // Content is static during a drag; the cached overflow is good enough.
    window.scrollTo({ top: Math.round(ratio * state.max) });
    update();
  }

  function scrollToMark(index) {
    const mark = state.marks[index];
    if (!mark) return;

    window.scrollTo({ top: Math.max(0, mark.top - stickyOffset()), behavior: 'smooth' });
    renderLabel(mark.top);
    syncAria();
  }

  function currentMarkIndex() {
    const current = markAtOffset(state.marks, window.scrollY);
    return current ? state.marks.indexOf(current) : 0;
  }

  // --- events --------------------------------------------------------------

  function onPointerDown(event) {
    if (state.max <= 0 || event.button > 0) return;

    event.preventDefault();
    refresh();
    showLabel();

    dragging = true;
    rail.classList.add('is-dragging');
    rail.setPointerCapture?.(event.pointerId);

    const rect = track.getBoundingClientRect();
    const grabbingThumb = Boolean(event.target.closest('.year-scrubber-thumb'));

    if (grabbingThumb) {
      // Keep the thumb under the finger instead of teleporting it.
      const thumbHeight = thumb.getBoundingClientRect().height;
      const ratio = state.max > 0 ? clamp(window.scrollY / state.max, 0, 1) : 0;
      grabOffset = event.clientY - (rect.top + thumbHeight / 2 + ratio * state.travel);
    } else {
      grabOffset = 0;
      scrollToRatio(ratioFromClientY(event.clientY));
    }
  }

  function onPointerMove(event) {
    if (!dragging) return;
    scrollToRatio(ratioFromClientY(event.clientY));
  }

  function onPointerEnd(event) {
    if (!dragging) return;

    dragging = false;
    rail.classList.remove('is-dragging');
    rail.releasePointerCapture?.(event.pointerId);
    hideLabelSoon();
  }

  function onKeyDown(event) {
    const keys = {
      ArrowUp: -1,
      ArrowLeft: -1,
      ArrowDown: 1,
      ArrowRight: 1,
      PageUp: -3,
      PageDown: 3,
    };

    refresh();
    if (state.marks.length === 0) return;

    let target = null;
    if (event.key in keys) {
      target = clamp(currentMarkIndex() + keys[event.key], 0, state.marks.length - 1);
    } else if (event.key === 'Home') {
      target = 0;
    } else if (event.key === 'End') {
      target = state.marks.length - 1;
    }

    if (target === null) return;
    event.preventDefault();
    showLabel();
    hideLabelSoon();
    scrollToMark(target);
  }

  const onEnter = () => {
    refresh();
    showLabel();
  };
  const onLeave = () => hideLabelSoon();
  const onFocus = () => {
    refresh();
    showLabel();
  };
  const onBlur = () => rail.classList.remove('is-active');
  const onScroll = () => {
    noteScrollSpeed();
    schedule();
  };

  // Dragging a window edge fires resize dozens of times; re-measuring the
  // timeline on each of those is what makes it feel sticky.
  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 150);
  };

  rail.addEventListener('pointerdown', onPointerDown);
  rail.addEventListener('pointermove', onPointerMove);
  rail.addEventListener('pointerup', onPointerEnd);
  rail.addEventListener('pointercancel', onPointerEnd);
  rail.addEventListener('pointerenter', onEnter);
  rail.addEventListener('pointerleave', onLeave);
  rail.addEventListener('focus', onFocus);
  rail.addEventListener('blur', onBlur);
  rail.addEventListener('keydown', onKeyDown);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  // The collection streams in; re-read the timeline when sections land. Watch
  // only the grid, not the whole body: every card append would otherwise wake
  // this up (including the rail's own DOM updates).
  //
  // Refreshes are coalesced but never postponed: a queued refresh always runs,
  // so a long load can't leave the timeline stuck on the first few years.
  let refreshTimer = 0;
  const scheduleRefresh = () => {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      refresh();
    }, 400);
  };

  const observedRoot = document.getElementById('results') || document.body;
  const observer =
    typeof MutationObserver === 'function'
      ? new MutationObserver((records) => {
          const addedSection = records.some((record) =>
            [...record.addedNodes].some(
              (node) =>
                node.nodeType === 1 &&
                (node.classList?.contains('section') || node.querySelector?.('.section'))
            )
          );
          if (addedSection) scheduleRefresh();
        })
      : null;
  observer?.observe(observedRoot, { childList: true, subtree: true });

  // Filtering only toggles `display`, which the observer above does not see, so
  // `search.js` pings us after each pass to rebuild the marks.
  const onFiltered = () => scheduleRefresh();
  document.addEventListener('cards:filtered', onFiltered);

  refresh();

  return () => {
    observer?.disconnect();
    document.removeEventListener('cards:filtered', onFiltered);
    clearTimeout(refreshTimer);
    clearTimeout(resizeTimer);
    clearTimeout(hideTimer);
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    rail.remove();
  };
}
