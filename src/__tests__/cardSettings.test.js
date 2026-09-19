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
      JSON.stringify({
        displayMode: 'list',
        currency: 'eur',
        swipeDismissToast: true,
        gridColumns: 5,
        gridRows: 4,
        pagesPerBinder: 64,
        preferredPrintings: {},
      })
    );
  });

  it('saveSettings stores the current settings in localStorage', async () => {
    const { cardSettings, saveSettings } = await import('../state/cardSettings.js');

    cardSettings.displayMode = 'list';
    saveSettings();

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'cardSettings',
      JSON.stringify({
        displayMode: 'list',
        currency: 'eur',
        swipeDismissToast: true,
        gridColumns: 5,
        gridRows: 4,
        pagesPerBinder: 64,
        preferredPrintings: {},
      })
    );
  });

  it('accepts a name -> id map but drops arrays, malformed values or over-cap maps', async () => {
    const { MAX_PREFERRED_PRINTINGS, cardSettings, applySettings } =
      await import('../state/cardSettings.js');

    expect(applySettings({ preferredPrintings: { 'Sol Ring': 'a', 'Mana Crypt': 'b' } })).toBe(
      true
    );
    expect(cardSettings.preferredPrintings).toEqual({ 'Sol Ring': 'a', 'Mana Crypt': 'b' });

    // A non-string id and the legacy array shape are both rejected.
    expect(applySettings({ preferredPrintings: { 'Sol Ring': 2 } })).toBe(false);
    expect(applySettings({ preferredPrintings: ['a'] })).toBe(false);
    expect(cardSettings.preferredPrintings).toEqual({ 'Sol Ring': 'a', 'Mana Crypt': 'b' });

    // An over-cap map is rejected rather than truncated by the sanitizer.
    const tooMany = Object.fromEntries(
      Array.from({ length: MAX_PREFERRED_PRINTINGS + 1 }, (_, i) => [`Card ${i}`, `p${i}`])
    );
    expect(applySettings({ preferredPrintings: tooMany })).toBe(false);
    expect(cardSettings.preferredPrintings).toEqual({ 'Sol Ring': 'a', 'Mana Crypt': 'b' });
  });

  it('applies only known, valid settings and reports whether anything changed', async () => {
    const { cardSettings, applySettings } = await import('../state/cardSettings.js');

    expect(applySettings({ displayMode: 'list', bogus: 1 })).toBe(true);
    expect(cardSettings.displayMode).toBe('list');
    expect(cardSettings.bogus).toBeUndefined();

    // A boolean setting is accepted too.
    expect(applySettings({ swipeDismissToast: false })).toBe(true);
    expect(cardSettings.swipeDismissToast).toBe(false);

    // The currency accepts only the three known ids.
    expect(applySettings({ currency: 'usd' })).toBe(true);
    expect(cardSettings.currency).toBe('usd');
    expect(applySettings({ currency: 'gbp' })).toBe(false);
    expect(cardSettings.currency).toBe('usd');

    // An invalid value is ignored, so nothing changes.
    expect(applySettings({ displayMode: 'nope' })).toBe(false);
    expect(cardSettings.displayMode).toBe('list');
  });

  it('accepts only in-range integer grid and binder settings', async () => {
    const { cardSettings, applySettings } = await import('../state/cardSettings.js');

    expect(applySettings({ gridColumns: 6, gridRows: 5, pagesPerBinder: 32 })).toBe(true);
    expect(cardSettings.gridColumns).toBe(6);
    expect(cardSettings.gridRows).toBe(5);
    expect(cardSettings.pagesPerBinder).toBe(32);

    // Out-of-range, non-integer and non-numeric values are all rejected.
    expect(applySettings({ gridColumns: 1 })).toBe(false);
    expect(applySettings({ gridColumns: 99 })).toBe(false);
    expect(applySettings({ gridColumns: 4.5 })).toBe(false);
    expect(applySettings({ gridRows: 0 })).toBe(false);
    expect(applySettings({ gridRows: '4' })).toBe(false);
    expect(applySettings({ pagesPerBinder: 0 })).toBe(false);
    expect(cardSettings.gridColumns).toBe(6);
    expect(cardSettings.gridRows).toBe(5);
    expect(cardSettings.pagesPerBinder).toBe(32);
  });

  it('accepts the full 2-16 grid range and rejects one step outside it', async () => {
    const { cardSettings, applySettings } = await import('../state/cardSettings.js');

    expect(applySettings({ gridColumns: 2, gridRows: 16 })).toBe(true);
    expect(cardSettings.gridColumns).toBe(2);
    expect(cardSettings.gridRows).toBe(16);

    expect(applySettings({ gridColumns: 16, gridRows: 2 })).toBe(true);
    expect(cardSettings.gridColumns).toBe(16);
    expect(cardSettings.gridRows).toBe(2);

    expect(applySettings({ gridColumns: 1 })).toBe(false);
    expect(applySettings({ gridColumns: 17 })).toBe(false);
    expect(applySettings({ gridRows: 1 })).toBe(false);
    expect(applySettings({ gridRows: 17 })).toBe(false);
    expect(cardSettings.gridColumns).toBe(16);
    expect(cardSettings.gridRows).toBe(2);
  });

  it('exposes cards-per-page and pages-per-binder derived from the settings', async () => {
    const { cardSettings, getCardsPerPage, getPagesPerBinder } =
      await import('../state/cardSettings.js');

    // Defaults: 5 columns x 4 rows, 64 pages to a binder.
    expect(getCardsPerPage()).toBe(20);
    expect(getPagesPerBinder()).toBe(64);

    cardSettings.gridColumns = 6;
    cardSettings.gridRows = 3;
    cardSettings.pagesPerBinder = 16;
    expect(getCardsPerPage()).toBe(18);
    expect(getPagesPerBinder()).toBe(16);
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
