// src/__tests__/tooltip.test.js
/* globals global */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showTooltip, hideTooltip, positionTooltip } from '../tooltip';
import { cardSettings } from '../cardSettings';

vi.mock('../cardSettings', () => ({
  cardSettings: {
    showTooltip: true,
  },
}));

// Mock the Image constructor
global.Image = class {
  constructor() {
    setTimeout(() => {
      this.onload();
    }, 100);
  }
};

describe('tooltip', () => {
  let tooltip;

  beforeEach(() => {
    tooltip = document.createElement('div');
    tooltip.id = 'tooltip';
    document.body.appendChild(tooltip);
  });

  it('should show and hide the tooltip', () => {
    const card = { id: 'card1', image_uris: { normal: 'http://example.com/card1.jpg' } };
    const event = { clientX: 100, clientY: 100 };

    showTooltip(event, card, tooltip);

    setTimeout(() => {
      expect(tooltip.style.display).toBe('flex');
      expect(tooltip.classList.contains('show')).toBe(true);

      hideTooltip(tooltip);
      expect(tooltip.style.display).toBe('none');
      expect(tooltip.classList.contains('show')).toBe(false);
    }, 300);
  });

  it('should position the tooltip', () => {
    tooltip.style.width = '100px';
    tooltip.style.height = '100px';
    const event = { clientX: 100, clientY: 100 };
    positionTooltip(event, tooltip);
    expect(tooltip.style.left).toBe('112px');
    expect(tooltip.style.top).toBe('112px');
  });
});
