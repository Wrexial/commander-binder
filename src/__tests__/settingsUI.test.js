import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initCardSettings } from '../ui/settingsUI.js';
import { getSetting, setSetting } from '../state/cardSettings.js';
import { updateCardStyles, applyDisplayMode } from '../ui/cards.js';

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
    // Reset mocks
    vi.clearAllMocks();

    // setupUI sidebars is where the settings toggles are injected
    document.body.innerHTML = '<div id="sidebar"></div>';
    getSetting.mockReturnValue(false);
  });

  it('should create a toggle for each setting reflecting its stored value', () => {
    getSetting.mockImplementation((key) => key === 'showTooltip');

    initCardSettings();

    const toggles = document.querySelectorAll('#sidebar input[type="checkbox"]');
    expect(toggles.length).toBe(3);

    expect(getSetting).toHaveBeenCalledWith('showTooltip');
    expect(getSetting).toHaveBeenCalledWith('persistentReveal');
    expect(getSetting).toHaveBeenCalledWith('displayMode');

    const showTooltipToggle = document.querySelector('[data-setting="showTooltip"]');
    const persistentRevealToggle = document.querySelector('[data-setting="persistentReveal"]');
    const displayModeToggle = document.querySelector('[data-setting="displayMode"]');
    expect(showTooltipToggle.checked).toBe(true);
    expect(persistentRevealToggle.checked).toBe(false);
    expect(displayModeToggle.checked).toBe(false);
  });

  it('should switch to image mode and re-render cards', () => {
    getSetting.mockImplementation((key) => (key === 'displayMode' ? 'text' : false));

    initCardSettings();

    const toggle = document.querySelector('[data-setting="displayMode"]');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    expect(setSetting).toHaveBeenCalledWith('displayMode', 'images');
    expect(applyDisplayMode).toHaveBeenCalled();
    expect(document.body.classList.contains('images-mode')).toBe(true);
  });

  it('should persist checkbox changes through setSetting', () => {
    initCardSettings();

    const toggle = document.querySelector('[data-setting="persistentReveal"]');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    expect(setSetting).toHaveBeenCalledWith('persistentReveal', true);
    expect(updateCardStyles).toHaveBeenCalled();
  });

  it('should not throw if the sidebar is missing', () => {
    document.body.innerHTML = '';
    expect(() => initCardSettings()).not.toThrow();
  });
});
