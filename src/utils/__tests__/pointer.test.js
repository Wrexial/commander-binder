import { describe, it, expect, afterEach, vi } from 'vitest';
import { isHoverCapable } from '../pointer.js';

describe('isHoverCapable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true for devices with a real pointer', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));

    expect(isHoverCapable()).toBe(true);
  });

  it('is false for touch-only devices', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));

    expect(isHoverCapable()).toBe(false);
  });

  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(isHoverCapable()).toBe(false);
  });
});
