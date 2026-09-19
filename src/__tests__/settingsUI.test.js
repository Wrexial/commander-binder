import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  applyLayoutVariables,
  applyGridSettings,
  applySettingsFromStore,
  handleDisplayModeChange,
  applyCurrencyChange,
  initCardSettings,
} from '../ui/settingsUI.js';
import { getSetting } from '../state/cardSettings.js';
import { applyDisplayMode, applyPreferredPrintings, updateCardStyles } from '../ui/cards.js';
import { refreshGridLayout } from '../ui/cardFeed.js';

vi.mock('../state/cardSettings.js', () => ({
  getSetting: vi.fn(),
}));

vi.mock('../ui/cards.js', () => ({
  updateCardStyles: vi.fn(),
  applyDisplayMode: vi.fn(),
  applyPreferredPrintings: vi.fn(),
}));

vi.mock('../ui/cardFeed.js', () => ({
  refreshGridLayout: vi.fn(),
}));

/** Default stored values used by most tests. */
function storedSettings(overrides = {}) {
  return {
    gridColumns: 5,
    gridRows: 4,
    pagesPerBinder: 64,
    displayMode: 'images',
    currency: 'eur',
    ...overrides,
  };
}

function useSettings(overrides = {}) {
  const values = storedSettings(overrides);
  getSetting.mockImplementation((key) => values[key]);
}

describe('settingsUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.className = '';
    document.documentElement.style.removeProperty('--grid-columns');
    document.documentElement.style.removeProperty('--grid-columns-mobile');
    useSettings();
  });

  it('publishes the grid dimensions to CSS', () => {
    useSettings({ gridColumns: 7, gridRows: 3 });

    applyLayoutVariables();

    expect(document.documentElement.style.getPropertyValue('--grid-columns')).toBe('7');
    // Mobile image tiles never go wider than three columns.
    expect(document.documentElement.style.getPropertyValue('--grid-columns-mobile')).toBe('3');
  });

  it('keeps the mobile grid at the column count when it is below three', () => {
    useSettings({ gridColumns: 3 });

    applyLayoutVariables();

    expect(document.documentElement.style.getPropertyValue('--grid-columns')).toBe('3');
    expect(document.documentElement.style.getPropertyValue('--grid-columns-mobile')).toBe('3');
  });

  it('rebuilds the grid only when the layout settings change', () => {
    initCardSettings(); // records 5x4x64

    applyGridSettings();
    expect(refreshGridLayout).not.toHaveBeenCalled();

    useSettings({ gridColumns: 6 });
    applyGridSettings();
    expect(refreshGridLayout).toHaveBeenCalledTimes(1);

    // A no-op repeat does not rebuild again.
    applyGridSettings();
    expect(refreshGridLayout).toHaveBeenCalledTimes(1);
  });

  it('reflows when only the binder capacity changes', () => {
    initCardSettings();

    useSettings({ pagesPerBinder: 16 });
    applyGridSettings();

    expect(refreshGridLayout).toHaveBeenCalledTimes(1);
  });

  it('toggles the display-mode body classes and rebuilds tiles', () => {
    handleDisplayModeChange('list');

    expect(document.body.classList.contains('list-mode')).toBe(true);
    expect(document.body.classList.contains('images-mode')).toBe(false);
    expect(applyDisplayMode).toHaveBeenCalledTimes(1);
  });

  it('re-renders and notifies on a currency change', () => {
    const listener = vi.fn();
    document.addEventListener('currency:changed', listener);

    applyCurrencyChange();

    expect(applyDisplayMode).toHaveBeenCalledTimes(1);
    expect(applyPreferredPrintings).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    document.removeEventListener('currency:changed', listener);
  });

  it('applies stored settings on a server pull and reflows the grid', () => {
    initCardSettings();
    useSettings({ displayMode: 'list', gridColumns: 6 });
    // Ignore the startup apply so the assertions below only cover the pull.
    vi.clearAllMocks();

    const listener = vi.fn();
    document.addEventListener('currency:changed', listener);

    applySettingsFromStore();

    expect(updateCardStyles).toHaveBeenCalledTimes(1);
    expect(applyDisplayMode).toHaveBeenCalledTimes(1);
    expect(applyPreferredPrintings).toHaveBeenCalledTimes(1);
    expect(refreshGridLayout).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('list-mode')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    document.removeEventListener('currency:changed', listener);
  });

  it('does not rebuild the grid when the server pull changes nothing structural', () => {
    initCardSettings();
    useSettings({ displayMode: 'text' });

    applySettingsFromStore();

    expect(refreshGridLayout).not.toHaveBeenCalled();
  });
});
