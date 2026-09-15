import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  trackStickyBarHeight,
  trackKeyboardInset,
  initViewportMetrics,
  STICKY_BAR_VAR,
  KEYBOARD_INSET_VAR,
} from '../viewport.js';

function rootVar(name) {
  return document.documentElement.style.getPropertyValue(name);
}

function clearRootVars() {
  for (const name of [STICKY_BAR_VAR, KEYBOARD_INSET_VAR]) {
    document.documentElement.style.removeProperty(name);
  }
}

describe('viewport metrics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearRootVars();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    clearRootVars();
  });

  describe('trackStickyBarHeight', () => {
    it('publishes the measured height of the sticky bar', () => {
      const bar = document.createElement('div');
      bar.getBoundingClientRect = () => ({ height: 96.4 });
      document.body.appendChild(bar);

      const stop = trackStickyBarHeight(bar);

      expect(rootVar(STICKY_BAR_VAR)).toBe('96px'); // rounded
      stop();
    });

    it('re-measures when the element resizes', () => {
      const bar = document.createElement('div');
      let height = 80;
      bar.getBoundingClientRect = () => ({ height });
      document.body.appendChild(bar);

      let trigger;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback) {
            trigger = callback;
          }
          observe() {}
          disconnect() {}
        }
      );

      const stop = trackStickyBarHeight(bar);
      expect(rootVar(STICKY_BAR_VAR)).toBe('80px');

      height = 140;
      trigger();

      expect(rootVar(STICKY_BAR_VAR)).toBe('140px');
      stop();
    });

    it('is a no-op without a target element', () => {
      const stop = trackStickyBarHeight(null);
      expect(rootVar(STICKY_BAR_VAR)).toBe('');
      expect(() => stop()).not.toThrow();
    });
  });

  describe('trackKeyboardInset', () => {
    function stubVisualViewport({ height, offsetTop = 0 }) {
      const listeners = {};
      const viewport = {
        height,
        offsetTop,
        addEventListener: (type, cb) => (listeners[type] = cb),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal('innerHeight', 800);
      vi.stubGlobal('visualViewport', viewport);
      return { viewport, listeners };
    }

    it('publishes the space the keyboard covers and clears it again', () => {
      const { viewport, listeners } = stubVisualViewport({ height: 500 });

      const stop = trackKeyboardInset();
      expect(rootVar(KEYBOARD_INSET_VAR)).toBe('300px');

      viewport.height = 800; // keyboard dismissed
      listeners.resize();

      expect(rootVar(KEYBOARD_INSET_VAR)).toBe('0px');
      stop();
    });

    it('accounts for a scrolled visual viewport', () => {
      stubVisualViewport({ height: 500, offsetTop: 100 });

      const stop = trackKeyboardInset();

      expect(rootVar(KEYBOARD_INSET_VAR)).toBe('200px');
      stop();
    });

    it('is a no-op when the browser has no visualViewport', () => {
      vi.stubGlobal('visualViewport', undefined);
      const stop = trackKeyboardInset();
      expect(rootVar(KEYBOARD_INSET_VAR)).toBe('');
      expect(() => stop()).not.toThrow();
    });
  });

  describe('initViewportMetrics', () => {
    it('tracks the toolbar it is given and tears both trackers down', () => {
      const bar = document.createElement('div');
      bar.getBoundingClientRect = () => ({ height: 64 });
      document.body.appendChild(bar);
      vi.stubGlobal('visualViewport', undefined);

      const stop = initViewportMetrics(bar);

      expect(rootVar(STICKY_BAR_VAR)).toBe('64px');
      expect(() => stop()).not.toThrow();
    });
  });
});
