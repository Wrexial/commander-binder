import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showTooltip, hideTooltip, positionTooltip } from '../tooltip.js';
import { cardSettings } from '../cardSettings.js';
import { imageCache } from '../config.js';

// Mock dependencies
vi.mock('../cardSettings.js', () => ({
  cardSettings: {
    showTooltip: true,
  },
}));

// Create a manual spy for the constructor
const imageConstructorSpy = vi.fn();

// Mock Image constructor with a simple, synchronous implementation
class MockImage {
    constructor() {
        imageConstructorSpy();
    }
    _src = '';
    onload = () => {};
    onerror = () => {};
    
    set src(val) {
        this._src = val;
        // Call onload asynchronously to avoid race conditions in tests
        setTimeout(() => this.onload(), 0);
    }
    get src() {
        return this._src;
    }
    // Stub properties needed by the code
    get complete() { return true; }
    get naturalWidth() { return 100; }
    // Make it behave enough like an element to be appended
    style = {};
    classList = { add: vi.fn(), toggle: vi.fn(), remove: vi.fn() };
    dataset = {};
    appendChild = vi.fn();
    querySelector = vi.fn();
    querySelectorAll = vi.fn(() => []);
    getBoundingClientRect = vi.fn(() => ({}));
    addEventListener = vi.fn();
    setAttribute = vi.fn();
    removeAttribute = vi.fn();
    get parentNode() { return { removeChild: vi.fn() } }
}
vi.stubGlobal('Image', MockImage);
vi.stubGlobal('HTMLImageElement', MockImage);


describe('tooltip', () => {
  let tooltip;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="tooltip"></div>';
    tooltip = document.getElementById('tooltip');
    imageCache.clear();
    vi.clearAllMocks();
    imageConstructorSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('showTooltip', () => {
    const event = { clientX: 100, clientY: 100 };
    const singleFaceCard = { id: 'card1', image_uris: { normal: 'http://example.com/card1.jpg' } };
    const multiFaceCard = {
      id: 'card2',
      layout: 'modal_dfc',
      card_faces: [
        { image_uris: { normal: 'http://example.com/card2a.jpg' } },
        { image_uris: { normal: 'http://example.com/card2b.jpg' } },
      ],
    };

    it('should not show if cardSettings.showTooltip is false', () => {
      cardSettings.showTooltip = false;
      showTooltip(event, singleFaceCard, tooltip);
      vi.runAllTimers();
      expect(tooltip.style.display).not.toBe('flex');
    });

    it('should show a loading message, then the card image for a single-faced card', (done) => {
      showTooltip(event, singleFaceCard, tooltip);
      
      setTimeout(() => {
        expect(tooltip.style.display).toBe('flex');
        const img = tooltip.querySelector('img');
        expect(img).not.toBeNull();
        expect(img.src).toBe(singleFaceCard.image_uris.normal);
        expect(tooltip.querySelector('.loading')).toBeNull();
        done();
      }, 300);
    });

    it('should show images for a multi-faced card', (done) => {
      showTooltip(event, multiFaceCard, tooltip);
      
      setTimeout(() => {
        const images = tooltip.querySelectorAll('img');
        expect(images.length).toBe(2);
        expect(images[0].src).toBe(multiFaceCard.card_faces[0].image_uris.normal);
        expect(images[1].src).toBe(multiFaceCard.card_faces[1].image_uris.normal);
        expect(tooltip.classList.contains('mdfc')).toBe(true);
        done();
      }, 300);
    });

    it('should use cached images instead of creating new ones', (done) => {
      showTooltip(event, singleFaceCard, tooltip);
      
      setTimeout(() => {
        expect(imageConstructorSpy).toHaveBeenCalledTimes(1);
        hideTooltip(tooltip, true);
        showTooltip(event, singleFaceCard, tooltip);
        
        setTimeout(() => {
          expect(imageConstructorSpy).toHaveBeenCalledTimes(1);
          done();
        }, 300);
      }, 300);
    });

    it('should handle cards with no image', (done) => {
        const cardWithNoImage = { id: 'card3' };
        showTooltip(event, cardWithNoImage, tooltip);
        
        setTimeout(() => {
            expect(tooltip.style.display).toBe('flex');
            const img = tooltip.querySelector('img');
            expect(img).toBeNull();
            done();
        }, 300);
    });
  });

  describe('hideTooltip', () => {
    it('should hide the tooltip', () => {
      tooltip.style.display = 'flex';
      hideTooltip(tooltip);
      expect(tooltip.style.display).toBe('none');
    });

    it('should not hide a pinned tooltip unless forced', (done) => {
      const event = { clientX: 100, clientY: 100 };
      const card = { id: 'card1', image_uris: { normal: 'http://example.com/card1.jpg' } };
      
      showTooltip(event, card, tooltip);
      
      setTimeout(() => {
        const pinBtn = tooltip.querySelector('.tooltip-pin');
        expect(pinBtn).not.toBeNull();
        pinBtn.click();
        
        hideTooltip(tooltip);
        expect(tooltip.style.display).toBe('flex');

        hideTooltip(tooltip, true);
        expect(tooltip.style.display).toBe('none');
        done();
      }, 300);
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
