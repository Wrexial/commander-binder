// src/__tests__/cardSettings.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('cardSettings', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules(); // Reset modules to reload cardSettings with fresh localStorage
  });

  it('loads the default settings when localStorage is empty', async () => {
    const { cardSettings } = await import('../state/cardSettings.js');
    expect(cardSettings.displayMode).toBe('images');
    expect(cardSettings.swipeDismissToast).toBe(true);
  });

  it('loads stored settings from localStorage', async () => {
    localStorageMock.setItem('cardSettings', JSON.stringify({ displayMode: 'text' }));

    const { cardSettings } = await import('../state/cardSettings.js');
    expect(cardSettings.displayMode).toBe('text');
  });

  it('drops unknown stored keys such as the removed persistentReveal', async () => {
    localStorageMock.setItem(
      'cardSettings',
      JSON.stringify({ displayMode: 'list', persistentReveal: true, bogus: 1 })
    );

    const { cardSettings, saveSettings } = await import('../state/cardSettings.js');

    expect(cardSettings.persistentReveal).toBeUndefined();
    expect(cardSettings.bogus).toBeUndefined();
    expect(cardSettings.displayMode).toBe('list');

    saveSettings();
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'cardSettings',
      JSON.stringify({ displayMode: 'list', swipeDismissToast: true, preferredPrintings: [] })
    );
  });

  it('saveSettings stores the current settings in localStorage', async () => {
    const { cardSettings, saveSettings } = await import('../state/cardSettings.js');

    cardSettings.displayMode = 'list';
    saveSettings();

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'cardSettings',
      JSON.stringify({ displayMode: 'list', swipeDismissToast: true, preferredPrintings: [] })
    );
  });

  it('accepts a printing-id list but drops out-of-cap or malformed values', async () => {
    const { MAX_PREFERRED_PRINTINGS, cardSettings, applySettings } =
      await import('../state/cardSettings.js');

    expect(applySettings({ preferredPrintings: ['a', 'b'] })).toBe(true);
    expect(cardSettings.preferredPrintings).toEqual(['a', 'b']);

    // Non-string entries are rejected.
    expect(applySettings({ preferredPrintings: ['a', 2] })).toBe(false);
    expect(cardSettings.preferredPrintings).toEqual(['a', 'b']);

    // An over-cap list is rejected rather than truncated by the sanitizer.
    const tooMany = Array.from({ length: MAX_PREFERRED_PRINTINGS + 1 }, (_, i) => `p${i}`);
    expect(applySettings({ preferredPrintings: tooMany })).toBe(false);
    expect(cardSettings.preferredPrintings).toEqual(['a', 'b']);
  });

  it('applies only known, valid settings and reports whether anything changed', async () => {
    const { cardSettings, applySettings } = await import('../state/cardSettings.js');

    expect(applySettings({ displayMode: 'list', bogus: 1 })).toBe(true);
    expect(cardSettings.displayMode).toBe('list');
    expect(cardSettings.bogus).toBeUndefined();

    // A boolean setting is accepted too.
    expect(applySettings({ swipeDismissToast: false })).toBe(true);
    expect(cardSettings.swipeDismissToast).toBe(false);

    // An invalid value is ignored, so nothing changes.
    expect(applySettings({ displayMode: 'nope' })).toBe(false);
    expect(cardSettings.displayMode).toBe('list');
  });

  it('notifies subscribers on setSetting but never echoes an applied patch', async () => {
    const { setSetting, applySettings, onSettingsChange } =
      await import('../state/cardSettings.js');
    const listener = vi.fn();
    const unsubscribe = onSettingsChange(listener);

    setSetting('displayMode', 'text');
    expect(listener).toHaveBeenCalledTimes(1);

    applySettings({ displayMode: 'list' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setSetting('displayMode', 'images');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
