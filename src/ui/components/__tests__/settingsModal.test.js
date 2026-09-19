import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createSettingsModal } from '../settingsModal.js';
import { getSetting, setSetting } from '../../../state/cardSettings.js';
import { resetPreferredPrintings } from '../../../state/preferredPrintings.js';
import {
  applyCurrencyChange,
  applyGridSettings,
  handleDisplayModeChange,
} from '../../settingsUI.js';
import { applyPreferredPrintings } from '../../cards.js';
import { getCurrency } from '../../../utils/prices.js';
import { showToast } from '../toast.js';

vi.mock('../../../state/cardSettings.js', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock('../../../state/preferredPrintings.js', () => ({
  resetPreferredPrintings: vi.fn(),
}));

vi.mock('../../settingsUI.js', () => ({
  applyCurrencyChange: vi.fn(),
  applyGridSettings: vi.fn(),
  handleDisplayModeChange: vi.fn(),
}));

vi.mock('../../cards.js', () => ({
  applyPreferredPrintings: vi.fn(),
}));

vi.mock('../../../utils/prices.js', () => ({
  CURRENCY_OPTIONS: [
    { id: 'eur', label: 'EUR' },
    { id: 'usd', label: 'USD' },
    { id: 'tix', label: 'TIX' },
  ],
  getCurrency: vi.fn(() => 'eur'),
}));

vi.mock('../toast.js', () => ({
  showToast: vi.fn(),
}));

const values = {
  displayMode: 'images',
  currency: 'eur',
  swipeDismissToast: true,
  gridColumns: 5,
  gridRows: 4,
  pagesPerBinder: 64,
};

function resetValues() {
  Object.assign(values, {
    displayMode: 'images',
    currency: 'eur',
    swipeDismissToast: true,
    gridColumns: 5,
    gridRows: 4,
    pagesPerBinder: 64,
  });
}

function select(ariaLabel) {
  return document.querySelector(`[aria-label="${ariaLabel}"]`);
}

function changeSelect(ariaLabel, value) {
  const el = select(ariaLabel);
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

describe('settingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetValues();
    getCurrency.mockReturnValue('eur');
    getSetting.mockImplementation((key) => values[key]);
    setSetting.mockImplementation((key, value) => {
      values[key] = value;
    });
    document.body.innerHTML = '';
  });

  it('reflects the stored settings in its controls', () => {
    createSettingsModal();

    expect(select('Card display mode').value).toBe('images');
    expect(select('Price currency').value).toBe('eur');
    expect(select('Grid columns').value).toBe('5');
    expect(select('Grid rows').value).toBe('4');
    expect(select('Pages per binder').value).toBe('64');

    const swipe = document.querySelector('.settings-row-toggle input[type="checkbox"]');
    expect(swipe.checked).toBe(true);
  });

  it('reports the current cards-per-page count', () => {
    getSetting.mockImplementation((key) =>
      key === 'gridColumns' ? 6 : key === 'gridRows' ? 5 : 0
    );
    createSettingsModal();

    expect(document.querySelector('.settings-readout').textContent).toContain('30 cards');
    expect(document.querySelector('.settings-readout').textContent).toContain('6 x 5');
  });

  it('updates the grid settings and reflows the grid', () => {
    createSettingsModal();

    changeSelect('Grid columns', '6');
    expect(setSetting).toHaveBeenCalledWith('gridColumns', 6);
    expect(applyGridSettings).toHaveBeenCalledTimes(1);

    changeSelect('Grid rows', '3');
    expect(setSetting).toHaveBeenCalledWith('gridRows', 3);
    expect(applyGridSettings).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.settings-readout').textContent).toContain('6 x 3');

    changeSelect('Pages per binder', '16');
    expect(setSetting).toHaveBeenCalledWith('pagesPerBinder', 16);
    expect(applyGridSettings).toHaveBeenCalledTimes(3);
  });

  it('applies a display-mode change', () => {
    createSettingsModal();

    changeSelect('Card display mode', 'list');

    expect(setSetting).toHaveBeenCalledWith('displayMode', 'list');
    expect(handleDisplayModeChange).toHaveBeenCalledWith('list');
  });

  it('applies a currency change', () => {
    createSettingsModal();

    changeSelect('Price currency', 'usd');

    expect(setSetting).toHaveBeenCalledWith('currency', 'usd');
    expect(applyCurrencyChange).toHaveBeenCalledTimes(1);
  });

  it('stores the swipe-to-dismiss toggle', () => {
    createSettingsModal();

    const swipe = document.querySelector('.settings-row-toggle input[type="checkbox"]');
    swipe.checked = false;
    swipe.dispatchEvent(new Event('change'));

    expect(setSetting).toHaveBeenCalledWith('swipeDismissToast', false);
  });

  it('resets the preferred printings', () => {
    createSettingsModal();

    document.querySelector('.settings-reset-printings').click();

    expect(resetPreferredPrintings).toHaveBeenCalledTimes(1);
    expect(applyPreferredPrintings).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Preferred printings cleared.', 'success');
  });

  it('closes when the Close button is clicked', () => {
    const { show } = createSettingsModal();
    show();
    const backdrop = document.querySelector('.list-modal-backdrop');
    expect(backdrop).not.toBeNull();

    [...document.querySelectorAll('.modal-button-container button')]
      .find((button) => button.textContent === 'Close')
      .click();

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });
});
