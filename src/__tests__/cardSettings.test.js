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

  it('should load default settings when localStorage is empty', async () => {
    const { cardSettings } = await import('../state/cardSettings.js');
    expect(cardSettings.showTooltip).toBe(true);
    expect(cardSettings.displayMode).toBe('images');
  });

  it('should load settings from localStorage if they exist', async () => {
    localStorageMock.setItem(
      'cardSettings',
      JSON.stringify({
        showTooltip: false,
        displayMode: 'text',
      })
    );

    const { cardSettings } = await import('../state/cardSettings.js');
    expect(cardSettings.showTooltip).toBe(false);
    expect(cardSettings.displayMode).toBe('text');
  });

  it('should merge stored settings with defaults', async () => {
    localStorageMock.setItem('cardSettings', JSON.stringify({ displayMode: 'text' }));
    const { cardSettings } = await import('../state/cardSettings.js');
    expect(cardSettings.showTooltip).toBe(true); // From default
    expect(cardSettings.displayMode).toBe('text'); // From localStorage
  });

  it('drops the removed persistentReveal preference', async () => {
    localStorageMock.setItem('cardSettings', JSON.stringify({ persistentReveal: true }));
    const { cardSettings, saveSettings } = await import('../state/cardSettings.js');

    expect(cardSettings.persistentReveal).toBeUndefined();
    saveSettings();
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'cardSettings',
      JSON.stringify({ showTooltip: true, displayMode: 'images' })
    );
  });

  it('saveSettings should store the current settings in localStorage', async () => {
    const { cardSettings, saveSettings } = await import('../state/cardSettings.js');

    // Modify settings
    cardSettings.showTooltip = false;

    saveSettings();

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'cardSettings',
      JSON.stringify({ showTooltip: false, displayMode: 'images' })
    );
  });

  it('applies only known, valid settings and reports whether anything changed', async () => {
    const { cardSettings, applySettings } = await import('../state/cardSettings.js');

    expect(applySettings({ displayMode: 'list', showTooltip: 'nope', bogus: 1 })).toBe(true);
    expect(cardSettings.displayMode).toBe('list');
    expect(cardSettings.showTooltip).toBe(true); // invalid value ignored
    expect(cardSettings.bogus).toBeUndefined();

    expect(applySettings({ displayMode: 'list', showTooltip: true })).toBe(false);
  });

  it('notifies subscribers on setSetting but never echoes an applied patch', async () => {
    const { setSetting, applySettings, onSettingsChange } =
      await import('../state/cardSettings.js');
    const listener = vi.fn();
    const unsubscribe = onSettingsChange(listener);

    setSetting('showTooltip', false);
    expect(listener).toHaveBeenCalledTimes(1);

    applySettings({ showTooltip: true, displayMode: 'text' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setSetting('showTooltip', false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
