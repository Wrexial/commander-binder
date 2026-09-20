import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isGuestWelcomeDismissed,
  dismissGuestWelcome,
  isTourDone,
  markTourDone,
} from '../onboarding.js';

describe('guest welcome onboarding flag', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to not dismissed', () => {
    expect(isGuestWelcomeDismissed()).toBe(false);
  });

  it('remembers a dismissal', () => {
    dismissGuestWelcome();
    expect(isGuestWelcomeDismissed()).toBe(true);
  });

  it('stays best-effort when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isGuestWelcomeDismissed()).toBe(false);
    getItem.mockRestore();

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => dismissGuestWelcome()).not.toThrow();
    setItem.mockRestore();
  });
});

describe('first-run tour onboarding flag', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to not done', () => {
    expect(isTourDone()).toBe(false);
  });

  it('remembers completion', () => {
    markTourDone();
    expect(isTourDone()).toBe(true);
  });

  it('tracks the binder tour separately from the browse tour', () => {
    markTourDone('binder');

    expect(isTourDone('binder')).toBe(true);
    expect(isTourDone('browse')).toBe(false);
  });

  it('stays best-effort when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isTourDone()).toBe(false);
    getItem.mockRestore();

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => markTourDone()).not.toThrow();
    setItem.mockRestore();
  });
});
