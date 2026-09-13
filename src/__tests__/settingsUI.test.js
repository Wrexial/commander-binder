import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initCardSettings } from '../ui/settingsUI.js';
import { getSetting, setSetting } from '../state/cardSettings.js';
import { updateCardStyles } from '../ui/cards.js';

// Mock dependencies
vi.mock('../state/cardSettings.js', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock('../ui/cards.js', () => ({
  updateCardStyles: vi.fn(),
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
    expect(toggles.length).toBe(2);

    expect(getSetting).toHaveBeenCalledWith('showTooltip');
    expect(getSetting).toHaveBeenCalledWith('persistentReveal');

    const showTooltipToggle = document.querySelector('[data-setting="showTooltip"]');
    const persistentRevealToggle = document.querySelector('[data-setting="persistentReveal"]');
    expect(showTooltipToggle.checked).toBe(true);
    expect(persistentRevealToggle.checked).toBe(false);
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
