import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initYearScrubber,
  buildMarks,
  labelMarks,
  markAtOffset,
  maxScrollTop,
} from '../yearScrubber.js';
import { filters, resetFilters } from '../../state/filters.js';

/** Build sections the way cardFeed does: release order, oldest first. */
function seedSections(sections) {
  const results = document.createElement('div');
  results.id = 'results';
  document.body.appendChild(results);

  for (const section of sections) {
    const el = document.createElement('div');
    el.className = 'section';
    el.dataset.year = String(section.year);
    if (section.sets) el.dataset.sets = section.sets;
    // jsdom has no layout, so stand in for the real offsets. Tops are document
    // coordinates, which is why the viewport-relative box subtracts scrollY.
    el.getBoundingClientRect = () => ({ top: section.top - window.scrollY });
    results.appendChild(el);
  }
  return results;
}

/** jsdom reports a zero-height document; fake a scrollable one. */
function stubScrollMetrics({ scrollHeight = 20000, innerHeight = 800, scrollY = 0 } = {}) {
  const counter = { reads: 0 };
  const scrolling = {
    scrollTop: scrollY,
    // Reading this forces a layout flush in a real engine, so count the reads.
    get scrollHeight() {
      counter.reads++;
      return scrollHeight;
    },
  };
  Object.defineProperty(document, 'scrollingElement', { value: scrolling, configurable: true });
  vi.stubGlobal('innerHeight', innerHeight);
  vi.stubGlobal('scrollY', scrollY);

  const scrollTo = vi.fn((options) => {
    // Mirror the browser so the thumb/label reflect the new position.
    if (typeof options === 'object' && typeof options.top === 'number') {
      scrolling.scrollTop = options.top;
      vi.stubGlobal('scrollY', options.top);
    }
  });
  window.scrollTo = scrollTo;
  return {
    scrolling,
    scrollTo,
    setScrollY: (y) => vi.stubGlobal('scrollY', y),
    overflowReads: () => counter.reads,
  };
}

describe('year scrubber', () => {
  let teardown;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    teardown?.();
    teardown = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  describe('buildMarks', () => {
    it('returns every visible section, in order', () => {
      seedSections([
        { year: 1994, top: 0, sets: 'LEG' },
        { year: 1994, top: 400, sets: 'FEM' },
        { year: 1995, top: 900, sets: 'ICE' },
        { year: 1996, top: 1500, sets: 'ALL' },
      ]);

      const marks = buildMarks();

      expect(marks.map((mark) => mark.label)).toEqual(['1994', '1994', '1995', '1996']);
      expect(marks.map((mark) => mark.sets)).toEqual(['LEG', 'FEM', 'ICE', 'ALL']);
      expect(marks.map((mark) => mark.top)).toEqual([0, 400, 900, 1500]);
    });

    it('ignores sections without a release year', () => {
      seedSections([
        { year: 2000, top: 0 },
        { year: NaN, top: 100 },
      ]);

      expect(buildMarks().map((mark) => mark.label)).toEqual(['2000']);
    });

    it('prefers an explicit data-mark over the year', () => {
      seedSections([{ year: 1994, top: 0 }]);
      document.querySelector('.section').dataset.mark = 'A';

      expect(buildMarks().map((mark) => mark.label)).toEqual(['A']);
    });

    it('measures every section top', () => {
      const seeded = seedSections([
        { year: 1994, top: 0 },
        { year: 1994, top: 400 },
        { year: 1994, top: 800 },
        { year: 1995, top: 1200 },
        { year: 1995, top: 1600 },
        { year: 1996, top: 2000 },
      ]);
      const spies = [...seeded.querySelectorAll('.section')].map((section) =>
        vi.spyOn(section, 'getBoundingClientRect')
      );

      buildMarks();

      const measured = spies.filter((spy) => spy.mock.calls.length > 0);
      expect(measured).toHaveLength(6);
    });

    it('returns nothing when no sections are rendered yet', () => {
      expect(buildMarks()).toEqual([]);
    });
  });

  describe('labelMarks', () => {
    it('keeps the first mark of each run of the same label', () => {
      const marks = [
        { label: '1994', top: 0 },
        { label: '1994', top: 400 },
        { label: '1995', top: 900 },
        { label: '1995', top: 1200 },
        { label: '1996', top: 1500 },
      ];

      expect(labelMarks(marks).map((mark) => mark.top)).toEqual([0, 900, 1500]);
    });
  });

  describe('smart marks', () => {
    function makeCard(data) {
      const card = document.createElement('div');
      card.className = 'card';
      card.cardData = data;
      return card;
    }

    function seedCardSection({ top = 0, cards = [], hidden = false } = {}) {
      let results = document.getElementById('results');
      if (!results) {
        results = document.createElement('div');
        results.id = 'results';
        document.body.appendChild(results);
      }

      const section = document.createElement('div');
      section.className = 'section';
      section.getBoundingClientRect = () => ({ top: top - window.scrollY });
      for (const data of cards) section.appendChild(makeCard(data));
      results.appendChild(section);

      if (hidden) section.style.display = 'none';
      return section;
    }

    afterEach(() => {
      resetFilters();
    });

    it('uses the first visible card and skips filtered-out sections', () => {
      seedCardSection({ top: 0, cards: [{ released_at: '2020-01-01', set: 'zend' }] });
      seedCardSection({
        top: 500,
        cards: [{ released_at: '1990-01-01', set: 'ice' }],
        hidden: true,
      });

      expect(buildMarks().map((mark) => mark.label)).toEqual(['2020']);
    });

    it('skips hidden cards when picking a section mark', () => {
      const section = seedCardSection({
        top: 0,
        cards: [
          { released_at: '2020-01-01', set: 'zend' },
          { released_at: '2015-01-01', set: 'bfz' },
        ],
      });
      section.querySelectorAll('.card')[0].style.display = 'none';

      expect(buildMarks()[0].label).toBe('2015');
    });

    it('labels marks by the active sort', () => {
      filters.sort = 'color-asc';
      seedCardSection({
        top: 0,
        cards: [{ released_at: '2020-01-01', set: 'zend', color_identity: ['U', 'W'] }],
      });

      expect(buildMarks()[0].label).toBe('Azorius');
    });
  });

  describe('rail label', () => {
    let results;
    let localTeardown;

    function seedSection(top, cards) {
      const section = document.createElement('div');
      section.className = 'section';
      section.getBoundingClientRect = () => ({ top: top - window.scrollY, height: 0 });
      for (const data of cards) {
        const card = document.createElement('div');
        card.className = 'card';
        card.cardData = data;
        section.appendChild(card);
      }
      results.appendChild(section);
      return section;
    }

    const labelText = () => document.querySelector('.year-scrubber-year').textContent;
    const setsText = () => document.querySelector('.year-scrubber-sets').textContent;

    beforeEach(() => {
      vi.useFakeTimers();
      resetFilters();
      document.body.innerHTML = '';
      results = document.createElement('div');
      results.id = 'results';
      document.body.appendChild(results);
    });

    afterEach(() => {
      localTeardown?.();
      localTeardown = null;
      resetFilters();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      document.body.innerHTML = '';
    });

    it('labels the rail with the active sort', () => {
      seedSection(0, [{ released_at: '1994-01-01', set: 'leg', color_identity: ['W', 'U'] }]);
      localTeardown = initYearScrubber();

      expect(labelText()).toBe('1994');

      filters.sort = 'color-asc';
      document.dispatchEvent(new CustomEvent('cards:filtered'));
      vi.advanceTimersByTime(500);

      expect(labelText()).toBe('Azorius');
    });

    it('shows the sets of the section under the thumb, not the first of the year', () => {
      seedSection(0, [{ released_at: '1994-01-01', set: 'leg' }]);
      seedSection(1000, [{ released_at: '1994-06-01', set: 'fem' }]);

      vi.stubGlobal('scrollY', 1000);
      localTeardown = initYearScrubber();

      expect(labelText()).toBe('1994');
      expect(setsText()).toBe('FEM');
    });
  });

  describe('markAtOffset', () => {
    const marks = [
      { year: 1994, top: 0 },
      { year: 1995, top: 900 },
      { year: 1996, top: 1500 },
    ];

    it('finds the year the reader is inside', () => {
      expect(markAtOffset(marks, 0).year).toBe(1994);
      expect(markAtOffset(marks, 899).year).toBe(1994);
      expect(markAtOffset(marks, 900).year).toBe(1995);
      expect(markAtOffset(marks, 99999).year).toBe(1996);
    });

    it('clamps to the first year above the timeline', () => {
      expect(markAtOffset(marks, -500).year).toBe(1994);
    });

    it('handles an empty timeline', () => {
      expect(markAtOffset([], 100)).toBeNull();
    });
  });

  describe('maxScrollTop', () => {
    it('is the overflow below the fold', () => {
      stubScrollMetrics({ scrollHeight: 5000, innerHeight: 800 });
      expect(maxScrollTop()).toBe(4200);
    });

    it('is zero when the page does not scroll', () => {
      stubScrollMetrics({ scrollHeight: 600, innerHeight: 800 });
      expect(maxScrollTop()).toBe(0);
    });
  });

  describe('rail', () => {
    let metrics;

    beforeEach(() => {
      document.body.innerHTML = '';
      seedSections([
        { year: 1994, top: 0, sets: 'LEG' },
        { year: 1995, top: 900, sets: 'ICE' },
        { year: 2000, top: 3000, sets: 'INV' },
      ]);
      metrics = stubScrollMetrics();
      // The rail measures its track and thumb; give both a real box.
      Element.prototype.getBoundingClientRect = function () {
        if (this.classList?.contains('year-scrubber-track')) return { top: 100, height: 600 };
        if (this.classList?.contains('year-scrubber-thumb')) return { top: 0, height: 60 };
        return { top: 0, height: 0 };
      };
      teardown = initYearScrubber();
    });

    afterEach(() => {
      delete Element.prototype.getBoundingClientRect;
    });

    it('adds itself to the page as a vertical slider', () => {
      const rail = document.getElementById('year-scrubber');
      expect(rail).not.toBeNull();
      expect(rail.getAttribute('role')).toBe('slider');
      expect(rail.getAttribute('aria-orientation')).toBe('vertical');
    });

    it('stays hidden until there is something to scroll', () => {
      vi.useFakeTimers();
      const rail = document.getElementById('year-scrubber');
      expect(rail.classList.contains('is-visible')).toBe(true);

      // The rail re-measures on a trailing debounce, not on every resize event.
      stubScrollMetrics({ scrollHeight: 400, innerHeight: 800 });
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(200);

      expect(rail.classList.contains('is-visible')).toBe(false);
      vi.useRealTimers();
    });

    it('reports the mark under the thumb through aria', () => {
      const rail = document.getElementById('year-scrubber');
      expect(rail.getAttribute('aria-valuemin')).toBe('0');
      expect(rail.getAttribute('aria-valuemax')).toBe('2');
      expect(rail.getAttribute('aria-valuenow')).toBe('0');
      expect(rail.getAttribute('aria-valuetext')).toContain('1994');

      metrics.setScrollY(3200);
      window.dispatchEvent(new Event('scroll'));
      return new Promise((resolve) =>
        requestAnimationFrame(() => {
          expect(rail.getAttribute('aria-valuenow')).toBe('2');
          expect(rail.getAttribute('aria-valuetext')).toContain('2000');
          resolve();
        })
      );
    });

    it('jumps to the year of a tapped spot on the track', () => {
      const rail = document.getElementById('year-scrubber');

      // Track runs 100 → 700, thumb is 60 tall → travel 540. Tap 60% down.
      const event = new Event('pointerdown', { bubbles: true });
      event.clientY = 100 + 0.6 * 540 + 30;
      rail.dispatchEvent(event);

      expect(metrics.scrollTo).toHaveBeenCalledWith({ top: Math.round(0.6 * 19200) });
      expect(rail.classList.contains('is-active')).toBe(true);
    });

    it('drags the thumb without jumping when grabbed', () => {
      const rail = document.getElementById('year-scrubber');
      const thumb = rail.querySelector('.year-scrubber-thumb');
      metrics.setScrollY(9600); // half way: thumb centred on the track

      const down = new Event('pointerdown', { bubbles: true });
      down.clientY = 100 + 270 + 30; // exactly on the thumb centre
      thumb.dispatchEvent(down);
      expect(metrics.scrollTo).not.toHaveBeenCalled();

      const move = new Event('pointermove', { bubbles: true });
      move.clientY = down.clientY + 108; // +20% of the travel
      rail.dispatchEvent(move);

      expect(metrics.scrollTo).toHaveBeenCalledWith({ top: Math.round(0.7 * 19200) });
    });

    it('scrolls a year at a time with the arrow keys', () => {
      const rail = document.getElementById('year-scrubber');
      rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      // 1995 starts at 900; the sticky bars take 56px (no CSS var set here).
      expect(metrics.scrollTo).toHaveBeenCalledWith({ top: 844, behavior: 'smooth' });

      rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      expect(metrics.scrollTo).toHaveBeenLastCalledWith({ top: 2944, behavior: 'smooth' });
    });

    it('reveals the readout while scrolling fast, not while nudging', () => {
      vi.useFakeTimers();
      const rail = document.getElementById('year-scrubber');
      const clock = { now: 1000 };
      const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock.now);

      // One small step: not a skim.
      metrics.setScrollY(120);
      window.dispatchEvent(new Event('scroll'));
      expect(rail.classList.contains('is-active')).toBe(false);

      // A flick: several big steps with no pause between them.
      for (let i = 0; i < 4; i++) {
        clock.now += 30;
        metrics.setScrollY(window.scrollY + 900);
        window.dispatchEvent(new Event('scroll'));
      }
      expect(rail.classList.contains('is-active')).toBe(true);
      expect(rail.querySelector('.year-scrubber-year').textContent).toBe('2000');
      expect(rail.querySelector('.year-scrubber-sets').textContent).toBe('INV');

      // The readout fades out once the scrolling stops.
      vi.advanceTimersByTime(1000);
      expect(rail.classList.contains('is-active')).toBe(false);

      nowSpy.mockRestore();
      vi.useRealTimers();
    });

    it('treats a pause as the end of a fast-scroll burst', () => {
      vi.useFakeTimers();
      const rail = document.getElementById('year-scrubber');
      const clock = { now: 1000 };
      const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock.now);

      // Three slow, spaced-out steps never add up to a burst.
      for (let i = 0; i < 3; i++) {
        clock.now += 400;
        metrics.setScrollY(window.scrollY + 300);
        window.dispatchEvent(new Event('scroll'));
      }

      expect(rail.classList.contains('is-active')).toBe(false);
      nowSpy.mockRestore();
      vi.useRealTimers();
    });

    it('does not re-measure the document height on every scroll frame', async () => {
      const before = metrics.overflowReads();

      for (let i = 0; i < 10; i++) {
        metrics.setScrollY(i * 100);
        window.dispatchEvent(new Event('scroll'));
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(metrics.overflowReads() - before).toBeLessThanOrEqual(1);
    });

    it('removes itself on teardown', () => {
      teardown();
      teardown = null;

      expect(document.getElementById('year-scrubber')).toBeNull();
    });
  });

  describe('visibility gating', () => {
    let metrics;
    let localTeardown;

    beforeEach(() => {
      document.body.innerHTML = '';
      seedSections([
        { year: 1994, top: 0, sets: 'LEG' },
        { year: 1995, top: 900, sets: 'ICE' },
      ]);
      const settings = document.createElement('div');
      settings.id = 'card-settings';
      document.body.appendChild(settings);
      metrics = stubScrollMetrics();
      // jsdom has no layout, so give the toolbar and rail their boxes.
      Element.prototype.getBoundingClientRect = function () {
        if (this.id === 'card-settings') return { top: 150, height: 72 };
        if (this.classList?.contains('year-scrubber-track')) return { top: 0, height: 600 };
        if (this.classList?.contains('year-scrubber-thumb')) return { top: 0, height: 60 };
        return { top: 0, height: 0 };
      };
      localTeardown = initYearScrubber();
    });

    afterEach(() => {
      localTeardown?.();
      localTeardown = null;
      delete Element.prototype.getBoundingClientRect;
    });

    it('hides the rail while the toolbar is still under the header', () => {
      const rail = document.getElementById('year-scrubber');
      expect(rail.classList.contains('is-visible')).toBe(false);
    });

    it('shows the rail once the toolbar has scrolled to the top', async () => {
      const rail = document.getElementById('year-scrubber');

      metrics.setScrollY(200);
      window.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(rail.classList.contains('is-visible')).toBe(true);
    });
  });
});
