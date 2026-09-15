// src/__tests__/layout.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startNewBinder, startNewSection } from '../ui/layout.js';
import { appState } from '../state/appState.js';

vi.mock('../state/appState.js', () => ({
  appState: {
    count: 0,
    binder: null,
    section: null,
    grid: null,
  },
}));

// Mock getComputedStyle
global.getComputedStyle = vi.fn(() => ({
  getPropertyValue: () => '',
}));

/** Pretend the device can (or cannot) hover. */
function stubHoverCapability(canHover) {
  vi.stubGlobal('matchMedia', () => ({
    matches: canHover,
    addEventListener() {},
    removeEventListener() {},
  }));
}

/** Dispatch a bare touch event (jsdom has no TouchEvent). */
function touch(element, type) {
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

describe('layout', () => {
  let results;

  beforeEach(() => {
    results = document.createElement('div');
    results.id = 'results';
    document.body.appendChild(results);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('startNewBinder', () => {
    it('should create a new binder', () => {
      startNewBinder(results);
      const binder = results.querySelector('.binder');
      expect(binder).not.toBeNull();
      expect(binder.querySelector('.binder-header')).not.toBeNull();
    });

    it('should set the binder color', () => {
      startNewBinder(results);
      const binder = results.querySelector('.binder');
      expect(binder.style.borderColor).not.toBe('');
    });

    it('should add a header to the binder', () => {
      startNewBinder(results);
      const header = results.querySelector('.binder-header');
      expect(header).not.toBeNull();
      expect(header.textContent).toContain('Binder 1');
    });

    it('should create the binder owned counter element', () => {
      startNewBinder(results);
      const owned = results.querySelector('.binder-owned');
      expect(owned).not.toBeNull();
    });

    it('runs only the tap action for a plain tap', () => {
      startNewBinder(results);
      const binder = results.querySelector('.binder');
      const header = binder.querySelector('.binder-header');
      const toggle = vi.spyOn(binder.classList, 'toggle');

      touch(header, 'touchstart');
      touch(header, 'touchend');
      header.click();

      expect(toggle).toHaveBeenCalledTimes(1);
      expect(toggle).toHaveBeenCalledWith('collapsed');
    });

    it('swallows the click that follows a long press', () => {
      vi.useFakeTimers();
      startNewBinder(results);
      const binder = results.querySelector('.binder');
      const header = binder.querySelector('.binder-header');
      // Give the long press something to act on, so the tap action would be
      // visible if it weren't swallowed.
      const section = document.createElement('div');
      section.className = 'section';
      binder.appendChild(section);
      const toggleAll = vi.spyOn(section.classList, 'toggle');

      touch(header, 'touchstart');
      vi.advanceTimersByTime(600); // long press: collapse/expand all sections
      header.click(); // the click the browser still sends on release

      expect(toggleAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('startNewSection', () => {
    beforeEach(() => {
      appState.binder = document.createElement('div');
      appState.binder.querySelectorAll = () => [];
    });

    it('should create a new section', () => {
      startNewSection();
      const section = appState.binder.querySelector('.section');
      expect(section).not.toBeNull();
      expect(section.querySelector('.page-header')).not.toBeNull();
      expect(section.querySelector('.grid')).not.toBeNull();
    });

    it('should add a header to the section', () => {
      startNewSection();
      const header = appState.binder.querySelector('.page-header');
      expect(header).not.toBeNull();
      expect(header.textContent).toContain('Page 1');
    });

    it('runs only the tap action for a plain tap', () => {
      startNewSection();
      const section = appState.binder.querySelector('.section');
      const header = section.querySelector('.page-header');
      const toggle = vi.spyOn(section.classList, 'toggle');

      touch(header, 'touchstart');
      touch(header, 'touchend');
      header.click();

      expect(toggle).toHaveBeenCalledTimes(1);
      expect(toggle).toHaveBeenCalledWith('collapsed');
    });

    it('swallows the click a long press leaves behind', () => {
      vi.useFakeTimers();
      startNewSection();
      const section = appState.binder.querySelector('.section');
      const header = section.querySelector('.page-header');
      const toggle = vi.spyOn(section.classList, 'toggle');

      touch(header, 'touchstart');
      vi.advanceTimersByTime(600);
      header.click();

      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it('should add set codes to the header', () => {
      const pageSets = new Map([
        ['dom', { name: 'Dominaria' }],
        ['m21', { name: 'Core Set 2021' }],
      ]);
      document.body.innerHTML = '<div id="set-tooltip" class="set-tooltip"></div>';
      startNewSection(pageSets);
      const header = appState.binder.querySelector('.page-header');
      expect(header.textContent).toContain('DOM, M21');
    });

    it('shows the set name on a tap without also collapsing the section', () => {
      vi.useFakeTimers();
      stubHoverCapability(false);
      document.body.innerHTML = '<div id="set-tooltip" class="set-tooltip"></div>';
      startNewSection(new Map([['dom', { name: 'Dominaria' }]]));

      const section = appState.binder.querySelector('.section');
      const chip = section.querySelector('.page-header span');
      const setTooltip = document.getElementById('set-tooltip');

      chip.click();

      expect(setTooltip.textContent).toBe('Dominaria');
      expect(setTooltip.style.display).toBe('block');
      expect(section.classList.contains('collapsed')).toBe(false);

      // The bubble is transient: it fades on its own, and any tap hides it.
      vi.advanceTimersByTime(3000);
      expect(setTooltip.style.display).toBe('none');
    });

    it('does not show the set bubble on touch hover events', () => {
      stubHoverCapability(false);
      document.body.innerHTML = '<div id="set-tooltip" class="set-tooltip"></div>';
      startNewSection(new Map([['dom', { name: 'Dominaria' }]]));

      const chip = appState.binder.querySelector('.page-header span');
      chip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      expect(document.getElementById('set-tooltip').style.display).not.toBe('block');
    });

    it('swallows a tap on the bubble itself', () => {
      stubHoverCapability(false);
      document.body.innerHTML = '<div id="set-tooltip" class="set-tooltip"></div>';
      startNewSection(new Map([['dom', { name: 'Dominaria' }]]));

      const setTooltip = document.getElementById('set-tooltip');
      const section = appState.binder.querySelector('.section');
      appState.binder.querySelector('.page-header span').click();
      expect(setTooltip.style.display).toBe('block');

      setTooltip.click();

      expect(setTooltip.style.display).toBe('none');
      // The dismissing tap did not also collapse the section it was covering.
      expect(section.classList.contains('collapsed')).toBe(false);
    });

    it('previews the set name on hover for pointer devices', () => {
      stubHoverCapability(true);
      document.body.innerHTML = '<div id="set-tooltip" class="set-tooltip"></div>';
      startNewSection(new Map([['dom', { name: 'Dominaria' }]]));

      const chip = appState.binder.querySelector('.page-header span');
      chip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      const setTooltip = document.getElementById('set-tooltip');
      expect(setTooltip.textContent).toBe('Dominaria');
      expect(setTooltip.style.display).toBe('block');

      chip.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      expect(setTooltip.style.display).toBe('none');
    });
  });
});
