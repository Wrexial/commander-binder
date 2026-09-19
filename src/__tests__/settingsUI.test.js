import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initCardSettings } from '../ui/settingsUI.js';
import { getSetting, setSetting } from '../state/cardSettings.js';
import { applyDisplayMode } from '../ui/cards.js';

// Mock dependencies
vi.mock('../state/cardSettings.js', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock('../ui/cards.js', () => ({
  updateCardStyles: vi.fn(),
  applyDisplayMode: vi.fn(),
  applyPreferredPrintings: vi.fn(),
}));

describe('initCardSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.className = '';
    // setupUI sidebars is where the settings controls are injected
    document.body.innerHTML = '<div id="sidebar"></div>';
    getSetting.mockReturnValue('images');
  });

  it('creates the display-mode picker reflecting the stored value', () => {
    getSetting.mockImplementation(() => 'text');

    initCardSettings();

    const select = document.querySelector('[data-setting="displayMode"]');
    expect(select).not.toBeNull();
    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map((option) => option.value)).toEqual(['images', 'text', 'list']);
    expect(select.value).toBe('text');

    // There is no longer a "show tooltip" toggle.
    expect(document.querySelector('[data-setting="showTooltip"]')).toBeNull();
    expect(getSetting).toHaveBeenCalledWith('displayMode');
  });

  it('switches to list mode and re-renders cards', () => {
    initCardSettings();

    const select = document.querySelector('[data-setting="displayMode"]');
    select.value = 'list';
    select.dispatchEvent(new Event('change'));

    expect(setSetting).toHaveBeenCalledWith('displayMode', 'list');
    expect(applyDisplayMode).toHaveBeenCalled();
    expect(document.body.classList.contains('list-mode')).toBe(true);
    expect(document.body.classList.contains('images-mode')).toBe(false);
  });

  it('switches back to images mode', () => {
    getSetting.mockReturnValue('text');

    initCardSettings();

    const select = document.querySelector('[data-setting="displayMode"]');
    select.value = 'images';
    select.dispatchEvent(new Event('change'));

    expect(setSetting).toHaveBeenCalledWith('displayMode', 'images');
    expect(document.body.classList.contains('images-mode')).toBe(true);
    expect(document.body.classList.contains('list-mode')).toBe(false);
  });

  it('toggles the swipe-to-dismiss-alerts setting', () => {
    getSetting.mockImplementation((key) => (key === 'swipeDismissToast' ? true : 'images'));

    initCardSettings();

    const toggle = document.querySelector('[data-setting="swipeDismissToast"]');
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(true);

    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    expect(setSetting).toHaveBeenCalledWith('swipeDismissToast', false);
  });

  it('should not throw if the sidebar is missing', () => {
    document.body.innerHTML = '';
    expect(() => initCardSettings()).not.toThrow();
  });
});
