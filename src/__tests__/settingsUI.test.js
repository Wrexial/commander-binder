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
}));

describe('initCardSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.className = '';
    // setupUI sidebars is where the settings toggles are injected
    document.body.innerHTML = '<div id="sidebar"></div>';
    getSetting.mockReturnValue(false);
  });

  it('creates the tooltip toggle and the display-mode picker', () => {
    getSetting.mockImplementation((key) => (key === 'showTooltip' ? true : 'images'));

    initCardSettings();

    const toggle = document.querySelector('[data-setting="showTooltip"]');
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(true);

    const select = document.querySelector('[data-setting="displayMode"]');
    expect(select).not.toBeNull();
    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map((option) => option.value)).toEqual(['images', 'text', 'list']);
    expect(select.value).toBe('images');

    expect(getSetting).toHaveBeenCalledWith('showTooltip');
    expect(getSetting).toHaveBeenCalledWith('displayMode');
  });

  it('switches to list mode and re-renders cards', () => {
    getSetting.mockImplementation((key) => (key === 'displayMode' ? 'images' : false));

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
    getSetting.mockImplementation((key) => (key === 'displayMode' ? 'text' : false));

    initCardSettings();

    const select = document.querySelector('[data-setting="displayMode"]');
    select.value = 'images';
    select.dispatchEvent(new Event('change'));

    expect(setSetting).toHaveBeenCalledWith('displayMode', 'images');
    expect(document.body.classList.contains('images-mode')).toBe(true);
    expect(document.body.classList.contains('list-mode')).toBe(false);
  });

  it('persists the tooltip checkbox through setSetting', () => {
    initCardSettings();

    const toggle = document.querySelector('[data-setting="showTooltip"]');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    expect(setSetting).toHaveBeenCalledWith('showTooltip', false);
  });

  it('should not throw if the sidebar is missing', () => {
    document.body.innerHTML = '';
    expect(() => initCardSettings()).not.toThrow();
  });
});
