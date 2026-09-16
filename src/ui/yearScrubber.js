// src/ui/yearScrubber.js
//
// A draggable timeline rail pinned to the right edge of the viewport. The thumb
// tracks the scroll position, dragging it scrubs the collection, and a floating
// label names the release year (plus the sets on that page) the thumb is over.
//
// Cards are rendered in release order (see `cardFeed.js`), so the section
// elements *are* the timeline; `cardFeed` stamps each one with `data-year` and
// `data-sets` for us to read.

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** The document's largest scroll offset (0 when nothing overflows). */
export function maxScrollTop() {
  const doc = document.scrollingElement || document.documentElement;
  return Math.max(0, doc.scrollHeight - window.innerHeight);
}

/**
 * The first section of every release year, in order. Sections are rendered
 * oldest-first, so this reads as a timeline.
 *
 * @param {ParentNode} [root]
 * @returns {{year: number, sets: string, top: number, section: Element}[]}
 */
export function buildYearMarks(root = document) {
  const marks = [];
  let lastYear = null;

  for (const section of root.querySelectorAll('.section')) {
    const year = Number(section.dataset.year);
    if (!year || year === lastYear) continue;

    lastYear = year;
    marks.push({
      year,
      sets: section.dataset.sets || '',
      top: Math.round(section.getBoundingClientRect().top + window.scrollY),
      section,
    });
  }

  return marks;
}

/**
 * The last mark at or before `offset` — i.e. the year the reader is looking at.
 *
 * @param {{year: number, top: number}[]} marks
 * @param {number} offset
 * @returns {{year: number, top: number}|null}
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

  /** @type {{marks: ReturnType<typeof buildYearMarks>, travel: number, max: number}} */
  const state = { marks: [], travel: 1, max: 0 };
  let dragging = false;
  let grabOffset = 0;
  let frame = 0;
  let hideTimer = 0;
  // Speed sampling for "skimmed past a year" feedback while scrolling normally.
  let burstDistance = 0;
  let lastScrollY = window.scrollY;
  let lastScrollAt = 0;

  // --- rendering -----------------------------------------------------------

  function thumbTravel() {
    const trackHeight = track.getBoundingClientRect().height;
    const thumbHeight = thumb.getBoundingClientRect().height;
    return Math.max(1, trackHeight - thumbHeight);
  }

  function renderTicks() {
    if (state.marks.length < 2 || state.marks.length > MAX_TICKS || state.max <= 0) {
      ticks.textContent = '';
      return;
    }

    ticks.textContent = '';
    for (const mark of state.marks) {
      const notch = document.createElement('i');
      notch.style.top = `${clamp(mark.top / (state.max + window.innerHeight), 0, 1) * 100}%`;
      ticks.append(notch);
    }
  }

  function renderLabel(offset) {
    const mark = markAtOffset(state.marks, offset);
    yearEl.textContent = mark ? String(mark.year) : '';
    setsEl.textContent = mark ? mark.sets : '';
    setsEl.hidden = !mark?.sets;
  }

  function syncAria() {
    if (state.marks.length === 0) return;

    const current = markAtOffset(state.marks, window.scrollY);
    rail.setAttribute('aria-valuemin', String(state.marks[0].year));
    rail.setAttribute('aria-valuemax', String(state.marks[state.marks.length - 1].year));
    if (current) {
      rail.setAttribute('aria-valuenow', String(current.year));
      rail.setAttribute('aria-valuetext', current.sets ? `${current.year} — ${current.sets}` : '');
    }
  }

  function update() {
    frame = 0;
    state.max = maxScrollTop();

    const ratio = state.max > 0 ? clamp(window.scrollY / state.max, 0, 1) : 0;
    const y = Math.round(ratio * state.travel);

    thumb.style.transform = `translateY(${y}px)`;
    // Percentages in a translate resolve against the element's own size, so
    // this centres the (taller) label on the thumb.
    label.style.transform = `translateY(calc(${y}px - 50%))`;

    rail.classList.toggle('is-visible', state.max > 0 && state.marks.length > 0);
    renderLabel(window.scrollY);
    syncAria();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  /** Re-read the timeline. Called when content may have been appended. */
  function refresh() {
    state.marks = buildYearMarks();
    state.travel = thumbTravel();
    state.max = maxScrollTop();
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
    state.max = maxScrollTop();
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
  const onResize = () => refresh();

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

  // The collection streams in; re-read the timeline when sections land.
  let refreshTimer = 0;
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
          if (!addedSection) return;

          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(refresh, 400);
        })
      : null;
  observer?.observe(document.body, { childList: true, subtree: true });

  refresh();

  return () => {
    observer?.disconnect();
    clearTimeout(refreshTimer);
    clearTimeout(hideTimer);
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    rail.remove();
  };
}
