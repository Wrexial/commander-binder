import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initYearScrubber, buildYearMarks, markAtOffset, maxScrollTop } from '../yearScrubber.js';

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
  const scrolling = { scrollHeight, scrollTop: scrollY };
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
  return { scrolling, scrollTo, setScrollY: (y) => vi.stubGlobal('scrollY', y) };
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

  describe('buildYearMarks', () => {
    it('keeps the first section of each year, in order', () => {
      seedSections([
        { year: 1994, top: 0, sets: 'LEG' },
        { year: 1994, top: 400, sets: 'FEM' },
        { year: 1995, top: 900, sets: 'ICE' },
        { year: 1996, top: 1500, sets: 'ALL' },
      ]);

      const marks = buildYearMarks();

      expect(marks.map((mark) => mark.year)).toEqual([1994, 1995, 1996]);
      expect(marks.map((mark) => mark.sets)).toEqual(['LEG', 'ICE', 'ALL']);
      expect(marks.map((mark) => mark.top)).toEqual([0, 900, 1500]);
    });

    it('ignores sections without a release year', () => {
      seedSections([
        { year: 2000, top: 0 },
        { year: NaN, top: 100 },
      ]);

      expect(buildYearMarks().map((mark) => mark.year)).toEqual([2000]);
    });

    it('returns nothing when no sections are rendered yet', () => {
      expect(buildYearMarks()).toEqual([]);
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
      const rail = document.getElementById('year-scrubber');
      expect(rail.classList.contains('is-visible')).toBe(true);

      stubScrollMetrics({ scrollHeight: 400, innerHeight: 800 });
      window.dispatchEvent(new Event('resize'));

      expect(rail.classList.contains('is-visible')).toBe(false);
    });

    it('reports the year under the thumb through aria', () => {
      const rail = document.getElementById('year-scrubber');
      expect(rail.getAttribute('aria-valuemin')).toBe('1994');
      expect(rail.getAttribute('aria-valuemax')).toBe('2000');
      expect(rail.getAttribute('aria-valuenow')).toBe('1994');

      metrics.setScrollY(3200);
      window.dispatchEvent(new Event('scroll'));
      return new Promise((resolve) =>
        requestAnimationFrame(() => {
          expect(rail.getAttribute('aria-valuenow')).toBe('2000');
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

    it('removes itself on teardown', () => {
      teardown();
      teardown = null;

      expect(document.getElementById('year-scrubber')).toBeNull();
    });
  });
});
