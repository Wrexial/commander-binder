import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showTooltip, hideTooltip, positionTooltip } from '../ui/tooltip.js';
import { cardSettings } from '../state/cardSettings.js';
import { getImage } from '../utils/imageCache.js';
import { getCardImages } from '../utils/cardImages.js';
import { cardStore } from '../state/cardStore.js';

// Mock dependencies
vi.mock('../state/cardSettings.js', () => ({
  cardSettings: {
    showTooltip: true,
  },
}));

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
    cardSettings.showTooltip = true;
    cardStore.getPrintingPosition.mockReturnValue({ index: 1, total: 1 });
    getCardImages.mockReturnValue([{ url: card.image_uris.normal, key: 'front' }]);
    getImage.mockImplementation(() => {
      const el = document.createElement('div');
      el.className = 'mock-image';
      return el;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('showTooltip', () => {
    it('should not show if cardSettings.showTooltip is false', () => {
      cardSettings.showTooltip = false;
      showTooltip(event, card, tooltip);
      vi.runAllTimers();
      expect(tooltip.style.display).not.toBe('flex');
      expect(getCardImages).not.toHaveBeenCalled();
    });

    it('should render the descriptor and a single image for a single-faced card', () => {
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.style.display).toBe('flex');
      expect(getCardImages).toHaveBeenCalledWith(card);
      expect(tooltip.querySelector('.card-descriptor').textContent).toContain('Dominaria #1');
      expect(tooltip.querySelectorAll('.mock-image').length).toBe(1);
      expect(tooltip.classList.contains('mdfc')).toBe(false);
    });

    it('should render multiple images for a multi-faced card', () => {
      getCardImages.mockReturnValue([
        { url: 'http://example.com/a.jpg', key: 'front' },
        { url: 'http://example.com/b.jpg', key: 'back' },
      ]);
      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.querySelectorAll('.mock-image').length).toBe(2);
      expect(tooltip.classList.contains('mdfc')).toBe(true);
    });
  });

  describe('printing cycle control', () => {
    it('renders a Next printing button that calls the host handler', () => {
      cardStore.getPrintingPosition.mockReturnValue({ index: 2, total: 5 });
      tooltip.onCycle = vi.fn();

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.querySelector('.printing-indicator').textContent).toBe('Version 2 of 5');

      const button = tooltip.querySelector('.printing-cycle');
      expect(button).not.toBeNull();

      button.click();
      expect(tooltip.onCycle).toHaveBeenCalledTimes(1);
    });

    it('omits the button when the host provides no cycle handler', () => {
      cardStore.getPrintingPosition.mockReturnValue({ index: 1, total: 3 });
      tooltip.onCycle = undefined;

      showTooltip(event, card, tooltip);
      vi.runAllTimers();

      expect(tooltip.querySelector('.printing-cycle')).toBeNull();
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
      tooltip.getBoundingClientRect = () => ({ width: 200, height: 300, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => {} });
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
