import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  showTooltip,
  showTooltipCard,
  hideTooltip,
  positionTooltip,
  isTooltipGestureActive,
} from '../ui/tooltip.js';
import { getImage } from '../utils/imageCache.js';
import { getCardImages } from '../utils/cardImages.js';
import { cardStore } from '../state/cardStore.js';

// Mock dependencies
vi.mock('../state/cardStore.js', () => ({
  cardStore: {
    getPrintings: vi.fn(() => []),
    getPrintingPosition: vi.fn(() => ({ index: 1, total: 1 })),
  },
}));

vi.mock('../utils/imageCache.js', () => ({
  getImage: vi.fn(),
}));

vi.mock('../utils/cardImages.js', () => ({
  getCardImages: vi.fn(),
}));

describe('tooltip', () => {
  let tooltip;

  const event = { clientX: 100, clientY: 100 };
  const card = {
    id: 'card1',
    name: 'Serra Angel',
    set_name: 'Dominaria',
    collector_number: '1',
    prices: { eur: '1.00', eur_foil: null },
    image_uris: { normal: 'http://example.com/card1.jpg' },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb) => cb());
    document.body.innerHTML = '<div id="tooltip"></div>';
    tooltip = document.getElementById('tooltip');
    vi.clearAllMocks();
    cardStore.getPrintingPosition.mockReturnValue({ index: 1, total: 1 });
    getCardImages.mockReturnValue([{ url: card.image_uris.normal, key: 'front' }]);
    getImage.mockImplementation(() => {
      const img = document.createElement('img');
      Object.defineProperty(img, 'complete', { value: true, configurable: true });
      Object.defineProperty(img, 'naturalWidth', { value: 100, configurable: true });
      return img;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('showTooltip', () => {
    it('should render the descriptor and a single image for a single-faced card', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.style.display).toBe('flex');
      expect(getCardImages).toHaveBeenCalledWith(card);
      // The descriptor moved to the tile footer; the tooltip is images only
      // on desktop (the mobile tooltip adds its own details block).
      expect(tooltip.querySelector('.card-descriptor')).toBeNull();
      expect(tooltip.querySelector('.tooltip-card-details')).toBeNull();
      expect(tooltip.querySelectorAll('img').length).toBe(1);
      expect(tooltip.classList.contains('mdfc')).toBe(false);
    });

    it('should render multiple images for a multi-faced card', () => {
      getCardImages.mockReturnValue([
        { url: 'http://example.com/a.jpg', key: 'front' },
        { url: 'http://example.com/b.jpg', key: 'back' },
      ]);
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.querySelectorAll('img').length).toBe(2);
      expect(tooltip.classList.contains('mdfc')).toBe(true);
    });
  });

  describe('printing cycle control', () => {
    it('renders a Next printing button that calls the host handler', () => {
      cardStore.getPrintingPosition.mockReturnValue({ index: 2, total: 5 });
      tooltip.onCycle = vi.fn();

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      // The printing count now lives in the tile footer, so the tooltip only
      // shows the cycle control on touch-capable hosts.
      expect(tooltip.querySelector('.printing-indicator')).toBeNull();

      const button = tooltip.querySelector('.printing-cycle');
      expect(button).not.toBeNull();
      expect(button.textContent).toBe('Next printing');

      button.click();
      expect(tooltip.onCycle).toHaveBeenCalledTimes(1);
    });

    it('uses a host-provided cycle label on hover-capable devices', () => {
      vi.stubGlobal('matchMedia', (query) => ({
        matches: query.includes('hover'),
        addEventListener() {},
        removeEventListener() {},
      }));
      cardStore.getPrintingPosition.mockReturnValue({ index: 1, total: 3 });
      tooltip.onCycle = vi.fn();
      tooltip.cycleLabel = 'Right-click for next printing';

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.querySelector('.printing-cycle').textContent).toBe(
        'Right-click for next printing'
      );
    });

    it('falls back to touch wording when the device cannot hover', () => {
      vi.stubGlobal('matchMedia', () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      }));
      cardStore.getPrintingPosition.mockReturnValue({ index: 1, total: 3 });
      tooltip.onCycle = vi.fn();
      tooltip.cycleLabel = 'Right-click for next printing';

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.querySelector('.printing-cycle').textContent).toBe('Next printing');
    });

    it('omits the button when the host provides no cycle handler', () => {
      cardStore.getPrintingPosition.mockReturnValue({ index: 1, total: 3 });
      tooltip.onCycle = undefined;

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.querySelector('.printing-cycle')).toBeNull();
    });
  });

  describe('mobile full-screen mode', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
      );
    });

    it('centres the tooltip and shows a blocking backdrop', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.classList.contains('modal')).toBe(true);
      const backdropEl = document.querySelector('.tooltip-backdrop');
      expect(backdropEl).not.toBeNull();
      expect(backdropEl.classList.contains('visible')).toBe(true);
      expect(document.body.classList.contains('tooltip-open')).toBe(true);
    });

    it('does not chase the pointer', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      positionTooltip({ clientX: 5, clientY: 5 }, tooltip);
      expect(tooltip.style.left).toBe('');
      expect(tooltip.style.top).toBe('');
    });

    it('shows the card details in the tooltip (instead of the hidden tile footer)', () => {
      cardStore.getPrintingPosition.mockReturnValue({ index: 2, total: 5 });
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      const details = tooltip.querySelector('.tooltip-card-details');
      expect(details).not.toBeNull();
      expect(details.querySelector('.tooltip-card-name').textContent).toBe('Serra Angel');
      expect(details.querySelector('.tooltip-card-set').textContent).toBe('Dominaria');
      // The price is its own pill so a long set name can't hide it.
      expect(details.querySelector('.tooltip-card-price').textContent).toBe('€1.00');
      const rest = details.querySelector('.tooltip-card-meta-rest').textContent;
      expect(rest).toContain('#1');
      expect(rest).toContain('2/5 printings');
      expect(details.querySelector('.tooltip-owned-status')).not.toBeNull();
    });

    it('places the printing-cycle button next to the owned/missing badge', () => {
      cardStore.getPrintingPosition.mockReturnValue({ index: 2, total: 5 });
      tooltip.onCycle = vi.fn();

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      const status = tooltip.querySelector('.tooltip-card-status');
      expect(status.querySelector('.tooltip-owned-status')).not.toBeNull();
      expect(status.querySelector('.printing-cycle')).not.toBeNull();
      // The old separate row is gone.
      expect(tooltip.querySelector('.tooltip-text-container')).toBeNull();
    });

    it('turns the owned/missing badge into a status toggle when the host allows it', async () => {
      const onToggle = vi.fn().mockResolvedValue(true);
      tooltip.onToggle = onToggle;

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      const badge = tooltip.querySelector('.tooltip-owned-status');
      expect(badge.tagName).toBe('BUTTON');
      expect(badge.textContent).toBe('Missing');
      expect(badge.getAttribute('aria-pressed')).toBe('false');

      badge.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(badge.textContent).toBe('Owned');
      expect(badge.classList.contains('owned')).toBe(true);
      expect(badge.getAttribute('aria-pressed')).toBe('true');
    });

    it('keeps the status as a plain badge without a host toggle', () => {
      delete tooltip.onToggle;

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.querySelector('.tooltip-owned-status').tagName).toBe('SPAN');
    });

    it('closes when the backdrop edge is tapped', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      document.querySelector('.tooltip-backdrop').click();

      expect(tooltip.style.display).toBe('none');
      expect(tooltip.classList.contains('modal')).toBe(false);
      expect(document.body.classList.contains('tooltip-open')).toBe(false);
    });

    it('offers an explicit close button', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      const closeButton = tooltip.querySelector('.tooltip-close');
      expect(closeButton).not.toBeNull();
      expect(closeButton.getAttribute('aria-label')).toBe('Close card preview');

      closeButton.click();

      expect(tooltip.style.display).toBe('none');
      expect(document.body.classList.contains('tooltip-open')).toBe(false);
    });

    it('keeps a one-tap-away grid click from becoming a card tap', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      // Open: the tap belongs to the dialog.
      expect(isTooltipGestureActive()).toBe(true);

      hideTooltip(tooltip);

      // Dismissed by this same gesture: the trailing click is still the
      // dialog's, not the tile's.
      expect(isTooltipGestureActive()).toBe(true);

      vi.advanceTimersByTime(500);
      expect(isTooltipGestureActive()).toBe(false);
    });

    describe('swipe to dismiss', () => {
      // jsdom has no TouchEvent, so build a plain event carrying `touches`.
      function touch(type, clientY, { cancelable = true } = {}) {
        const touchEvent = new Event(type, { bubbles: true, cancelable });
        touchEvent.touches = [{ clientX: 100, clientY }];
        return touchEvent;
      }

      it('dismisses the dialog after a long downward drag', () => {
        showTooltip(event, card, tooltip);
        vi.runAllTimers();

        tooltip.dispatchEvent(touch('touchstart', 200));
        tooltip.dispatchEvent(touch('touchmove', 320));

        expect(tooltip.classList.contains('dragging')).toBe(true);
        expect(tooltip.style.transform).toBe('translateY(120px)');

        tooltip.dispatchEvent(touch('touchend', 320));

        expect(tooltip.style.display).toBe('none');
        expect(tooltip.style.transform).toBe('');
        expect(document.body.classList.contains('tooltip-open')).toBe(false);
      });

      it('snaps back when the drag is too short', () => {
        showTooltip(event, card, tooltip);
        vi.runAllTimers();

        tooltip.dispatchEvent(touch('touchstart', 200));
        tooltip.dispatchEvent(touch('touchmove', 240));
        tooltip.dispatchEvent(touch('touchend', 240));

        expect(tooltip.style.display).toBe('flex');
        expect(tooltip.style.transform).toBe('');
        expect(tooltip.style.opacity).toBe('');
        expect(tooltip.classList.contains('dragging')).toBe(false);
      });

      it('treats an upward drag as a scroll, not a dismissal', () => {
        showTooltip(event, card, tooltip);
        vi.runAllTimers();

        tooltip.dispatchEvent(touch('touchstart', 300));
        tooltip.dispatchEvent(touch('touchmove', 100));
        tooltip.dispatchEvent(touch('touchend', 100));

        expect(tooltip.style.display).toBe('flex');
        expect(tooltip.classList.contains('dragging')).toBe(false);
      });
    });

    describe('swipe to navigate', () => {
      // jsdom has no TouchEvent, so build a plain event carrying `touches`.
      function touchAt(type, clientX, clientY, { cancelable = true } = {}) {
        const touchEvent = new Event(type, { bubbles: true, cancelable });
        touchEvent.touches = [{ clientX, clientY }];
        return touchEvent;
      }

      function swipe(fromX, toX) {
        tooltip.dispatchEvent(touchAt('touchstart', fromX, 200));
        tooltip.dispatchEvent(touchAt('touchmove', toX, 205));
        tooltip.dispatchEvent(touchAt('touchend', toX, 205));
      }

      it('asks for the next card on a left swipe', () => {
        const onNavigate = vi.fn();
        tooltip.onNavigate = onNavigate;

        showTooltip(event, card, tooltip);
        vi.runAllTimers();

        swipe(300, 200);

        expect(onNavigate).toHaveBeenCalledWith(1, expect.anything());
        // Navigating keeps the preview open.
        expect(tooltip.style.display).toBe('flex');
        expect(document.body.classList.contains('tooltip-open')).toBe(true);
      });

      it('asks for the previous card on a right swipe', () => {
        const onNavigate = vi.fn();
        tooltip.onNavigate = onNavigate;

        showTooltip(event, card, tooltip);
        vi.runAllTimers();

        swipe(100, 220);

        expect(onNavigate).toHaveBeenCalledWith(-1, expect.anything());
      });

      it('follows the finger sideways while swiping', () => {
        tooltip.onNavigate = vi.fn();

        showTooltip(event, card, tooltip);
        vi.runAllTimers();

        tooltip.dispatchEvent(touchAt('touchstart', 300, 200));
        tooltip.dispatchEvent(touchAt('touchmove', 220, 205));

        expect(tooltip.classList.contains('dragging')).toBe(true);
        expect(tooltip.style.transform).toBe('translateX(-80px)');
        expect(Number(tooltip.style.opacity)).toBeLessThan(1);

        tooltip.dispatchEvent(touchAt('touchend', 220, 205));

        // Releasing snaps the preview back before the next card renders.
        expect(tooltip.classList.contains('dragging')).toBe(false);
        expect(tooltip.style.transform).toBe('');
      });

      it('ignores a short horizontal drag', () => {
        const onNavigate = vi.fn();
        tooltip.onNavigate = onNavigate;

        showTooltip(event, card, tooltip);
        vi.runAllTimers();

        swipe(200, 230);

        expect(onNavigate).not.toHaveBeenCalled();
        expect(tooltip.style.display).toBe('flex');
      });

      it('does nothing when no navigation handler is registered', () => {
        tooltip.onNavigate = null;

        showTooltip(event, card, tooltip);
        vi.runAllTimers();

        swipe(300, 200);

        // A no-op, not a dismissal.
        expect(tooltip.style.display).toBe('flex');
      });

      it('does not also dismiss on a horizontal drag', () => {
        const onNavigate = vi.fn();
        tooltip.onNavigate = onNavigate;

        showTooltip(event, card, tooltip);
        vi.runAllTimers();

        // A long drag that combines both axes must not dismiss once locked to x.
        tooltip.dispatchEvent(touchAt('touchstart', 300, 200));
        tooltip.dispatchEvent(touchAt('touchmove', 150, 260));
        tooltip.dispatchEvent(touchAt('touchend', 150, 260));

        expect(onNavigate).toHaveBeenCalledWith(1, expect.anything());
        expect(tooltip.style.display).toBe('flex');
      });
    });
  });

  describe('floating tooltip swipe navigation', () => {
    // jsdom has no TouchEvent, so build a plain event carrying `touches`.
    function touchAt(type, clientX, clientY, { cancelable = true } = {}) {
      const touchEvent = new Event(type, { bubbles: true, cancelable });
      touchEvent.touches = [{ clientX, clientY }];
      return touchEvent;
    }

    function swipe(fromX, toX, y = 200) {
      tooltip.dispatchEvent(touchAt('touchstart', fromX, y));
      tooltip.dispatchEvent(touchAt('touchmove', toX, y + 5));
      tooltip.dispatchEvent(touchAt('touchend', toX, y + 5));
    }

    it('enables swipe navigation and moves next on a left swipe', () => {
      const onNavigate = vi.fn();
      tooltip.onNavigate = onNavigate;

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.classList.contains('modal')).toBe(false);
      expect(tooltip.classList.contains('swipe-nav')).toBe(true);
      expect(tooltip.style.display).toBe('flex');

      swipe(300, 200);

      expect(onNavigate).toHaveBeenCalledWith(1, expect.anything());
      expect(tooltip.style.display).toBe('flex');
    });

    it('moves to the previous card on a right swipe', () => {
      const onNavigate = vi.fn();
      tooltip.onNavigate = onNavigate;

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      swipe(100, 220);

      expect(onNavigate).toHaveBeenCalledWith(-1, expect.anything());
    });

    it('follows the finger sideways while swiping', () => {
      tooltip.onNavigate = vi.fn();

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      tooltip.dispatchEvent(touchAt('touchstart', 300, 200));
      tooltip.dispatchEvent(touchAt('touchmove', 220, 205));

      expect(tooltip.classList.contains('dragging')).toBe(true);
      expect(tooltip.style.transform).toBe('translateX(-80px)');
      expect(Number(tooltip.style.opacity)).toBeLessThan(1);

      tooltip.dispatchEvent(touchAt('touchend', 220, 205));
      expect(tooltip.style.transform).toBe('');
    });

    it('leaves vertical drags to the page (no dismiss off mobile)', () => {
      tooltip.onNavigate = vi.fn();

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      tooltip.dispatchEvent(touchAt('touchstart', 200, 200));
      tooltip.dispatchEvent(touchAt('touchmove', 200, 320));
      tooltip.dispatchEvent(touchAt('touchend', 200, 320));

      expect(tooltip.style.display).toBe('flex');
      expect(tooltip.classList.contains('dragging')).toBe(false);
    });

    it('does not enable swipe navigation without a handler', () => {
      tooltip.onNavigate = null;

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.classList.contains('swipe-nav')).toBe(false);
    });

    it('keeps the floating tooltip anchored when swapping cards', () => {
      tooltip.onNavigate = vi.fn();

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      tooltip.style.left = '200px';
      tooltip.style.top = '150px';

      showTooltipCard({ ...card, name: 'Another Angel' }, tooltip, {
        clientX: 0,
        clientY: 0,
      });

      expect(tooltip.style.left).toBe('200px');
      expect(tooltip.style.top).toBe('150px');
      expect(tooltip.currentCard.name).toBe('Another Angel');
    });
  });

  describe('dismissing a desktop-style tooltip on touch', () => {
    it('hides on a tap outside and swallows the trailing click', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      // Wide touch screens get the floating tooltip, not the full-screen dialog.
      expect(tooltip.classList.contains('modal')).toBe(false);
      expect(tooltip.style.display).toBe('flex');

      document.body.dispatchEvent(new Event('touchstart', { bubbles: true }));

      expect(tooltip.style.display).toBe('none');
      expect(isTooltipGestureActive()).toBe(true);
    });

    it('ignores a tap that lands on the tooltip itself', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      tooltip.dispatchEvent(new Event('touchstart', { bubbles: true }));

      expect(tooltip.style.display).toBe('flex');
    });
  });

  describe('hideTooltip', () => {
    it('should hide and clear the tooltip', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      hideTooltip(tooltip);

      expect(tooltip.style.display).toBe('none');
      expect(tooltip.innerHTML).toBe('');
      expect(tooltip.classList.contains('show')).toBe(false);
    });
  });

  describe('positionTooltip', () => {
    beforeEach(() => {
      tooltip.getBoundingClientRect = () => ({
        width: 200,
        height: 300,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      vi.stubGlobal('innerWidth', 1000);
      vi.stubGlobal('innerHeight', 800);
    });

    it('should position normally to the bottom-right', () => {
      positionTooltip({ clientX: 100, clientY: 100 }, tooltip);
      expect(tooltip.style.left).toBe('112px');
      expect(tooltip.style.top).toBe('112px');
    });

    it('should flip to the left if overflowing right', () => {
      positionTooltip({ clientX: 900, clientY: 100 }, tooltip);
      expect(tooltip.style.left).toBe('688px');
      expect(tooltip.style.top).toBe('112px');
    });

    it('should flip to the top if overflowing bottom', () => {
      positionTooltip({ clientX: 100, clientY: 700 }, tooltip);
      expect(tooltip.style.left).toBe('112px');
      expect(tooltip.style.top).toBe('388px');
    });

    it('should clamp to the left edge', () => {
      positionTooltip({ clientX: 10, clientY: 100 }, tooltip);
      expect(tooltip.style.left).toBe('22px');
    });

    it('should clamp to the top edge', () => {
      positionTooltip({ clientX: 100, clientY: 10 }, tooltip);
      expect(tooltip.style.top).toBe('22px');
    });
  });
});
