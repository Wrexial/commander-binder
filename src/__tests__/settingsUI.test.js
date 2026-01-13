import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initCardSettings } from '../settingsUI.js';
import * as cardSettingsModule from '../cardSettings.js';
import * as cardsModule from '../cards.js';

// Mock dependencies
vi.mock('../cardSettings.js', () => ({
  cardSettings: {
    foil: true,
    finish: 'glossy',
  },
  saveSettings: vi.fn(),
}));

vi.mock('../cards.js', () => ({
  updateCardStyles: vi.fn(),
}));

describe('initCardSettings', () => {
  let settingsContainer;
  let foilCheckbox;
  let finishSelect;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Set up DOM
    document.body.innerHTML = `
      <div id="card-settings">
        <input type="checkbox" data-setting="foil" />
        <select data-setting="finish">
          <option value="glossy">Glossy</option>
          <option value="matte">Matte</option>
        </select>
      </div>
    `;
    settingsContainer = document.getElementById('card-settings');
    foilCheckbox = settingsContainer.querySelector('[data-setting="foil"]');
    finishSelect = settingsContainer.querySelector('[data-setting="finish"]');
  });

  it('should initialize settings elements with values from cardSettings', () => {
    initCardSettings();

    expect(foilCheckbox.checked).toBe(true);
    expect(finishSelect.value).toBe('glossy');
  });

  it('should add a change event listener to checkboxes', () => {
    initCardSettings();

    // Simulate unchecking the box
    foilCheckbox.checked = false;
    foilCheckbox.dispatchEvent(new Event('change'));

    // Verify the effects
    expect(cardSettingsModule.cardSettings.foil).toBe(false);
    expect(cardSettingsModule.saveSettings).toHaveBeenCalledTimes(1);
    expect(cardsModule.updateCardStyles).toHaveBeenCalledTimes(1);
  });

  it('should add a change event listener to select elements', () => {
    initCardSettings();

    // Simulate changing the selection
    finishSelect.value = 'matte';
    finishSelect.dispatchEvent(new Event('change'));

    // Verify the effects
    expect(cardSettingsModule.cardSettings.finish).toBe('matte');
    expect(cardSettingsModule.saveSettings).toHaveBeenCalledTimes(1);
    expect(cardsModule.updateCardStyles).toHaveBeenCalledTimes(1);
  });

  it('should not throw if settings elements are not found', () => {
    document.body.innerHTML = '';
    expect(() => initCardSettings()).not.toThrow();
  });
});
