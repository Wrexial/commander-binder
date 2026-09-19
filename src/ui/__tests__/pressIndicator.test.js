import { describe, it, expect, beforeEach } from 'vitest';
import { showPressIndicator, hidePressIndicator } from '../pressIndicator.js';

describe('pressIndicator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows an active ring with the press duration', () => {
    showPressIndicator(100, 120, 500);

    const ring = document.querySelector('.press-indicator');
    expect(ring).not.toBeNull();
    expect(ring.classList.contains('active')).toBe(true);
    expect(ring.style.left).toBe('100px');
    expect(ring.style.top).toBe('120px');
    expect(ring.style.getPropertyValue('--press-duration')).toBe('500ms');
    expect(ring.querySelector('.press-indicator-fill')).not.toBeNull();
  });

  it('hides the ring without removing it', () => {
    showPressIndicator(100, 120, 500);
    hidePressIndicator();

    const ring = document.querySelector('.press-indicator');
    expect(ring).not.toBeNull();
    expect(ring.classList.contains('active')).toBe(false);
  });

  it('is a no-op to hide when nothing has been shown', () => {
    expect(() => hidePressIndicator()).not.toThrow();
  });
});
