import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isGuestWelcomeDismissed, dismissGuestWelcome } from '../onboarding.js';

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
