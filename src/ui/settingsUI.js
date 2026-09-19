import { getSetting, setSetting } from '../state/cardSettings.js';
import { resetPreferredPrintings } from '../state/preferredPrintings.js';
import { applyPreferredPrintings, updateCardStyles, applyDisplayMode } from './cards.js';
import { CURRENCY_OPTIONS, getCurrency } from '../utils/prices.js';
import { showToast } from './components/toast.js';

/** Tile layouts offered by the display-mode picker, in display order. */
const DISPLAY_MODE_OPTIONS = [
  { value: 'images', label: 'Images' },
  { value: 'text', label: 'Text only' },
  { value: 'list', label: 'List' },
];

/**
 * Build a labelled checkbox bound to a stored boolean setting.
 *
 * @param {object} config
 * @param {string} config.setting Key in `cardSettings`.
 * @param {string} config.label Visible label text.
 * @returns {{el: HTMLElement, input: HTMLInputElement}}
 */
function createSettingToggle({ setting, label }) {
  const labelEl = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.setting = setting;
  checkbox.checked = Boolean(getSetting(setting));

  checkbox.addEventListener('change', (event) => setSetting(setting, event.target.checked));

  labelEl.appendChild(checkbox);
  labelEl.appendChild(document.createTextNode(label));
  return { el: labelEl, input: checkbox };
}

/**
 * The display-mode picker. A `<select>` rather than a checkbox because there
 * are three tile layouts (images, text, list).
 *
 * @returns {{el: HTMLElement, select: HTMLSelectElement}}
 */
function createDisplayModePicker() {
  const labelEl = document.createElement('label');
  labelEl.className = 'sidebar-setting';

  const text = document.createElement('span');
  text.textContent = 'Display';
  labelEl.appendChild(text);

  const select = document.createElement('select');
  select.className = 'display-mode-select';
  select.dataset.setting = 'displayMode';
  select.setAttribute('aria-label', 'Card display mode');
  for (const option of DISPLAY_MODE_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    select.appendChild(el);
  }
  select.value = getSetting('displayMode');

  select.addEventListener('change', (event) => {
    const value = event.target.value;
    setSetting('displayMode', value);
    handleDisplayModeChange(value);
  });

  labelEl.appendChild(select);
  return { el: labelEl, select };
}

function handleDisplayModeChange(value) {
  document.body.classList.toggle('images-mode', value === 'images');
  document.body.classList.toggle('list-mode', value === 'list');
  applyDisplayMode();
}

/**
 * The price-currency picker. Changing it rebuilds every tile (prices are baked
 * in when the tile is rendered) and notifies the filter bar to relabel and
 * re-run its price filter against the new currency.
 *
 * @returns {{el: HTMLElement, select: HTMLSelectElement}}
 */
function createCurrencyPicker() {
  const labelEl = document.createElement('label');
  labelEl.className = 'sidebar-setting';

  const text = document.createElement('span');
  text.textContent = 'Currency';
  labelEl.appendChild(text);

  const select = document.createElement('select');
  select.className = 'currency-select';
  select.dataset.setting = 'currency';
  select.setAttribute('aria-label', 'Price currency');
  for (const option of CURRENCY_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.id;
    el.textContent = option.label;
    select.appendChild(el);
  }
  select.value = getCurrency();

  select.addEventListener('change', (event) => {
    setSetting('currency', event.target.value);
    applyCurrencyChange();
  });

  labelEl.appendChild(select);
  return { el: labelEl, select };
}

/** Re-render tiles and tell the filter bar the price unit changed. */
function applyCurrencyChange() {
  applyDisplayMode();
  document.dispatchEvent(new CustomEvent('currency:changed'));
}

/**
 * A button that forgets every remembered printing and falls the grid back to
 * each card's base printing. Without it the pin has no escape hatch.
 *
 * @returns {{el: HTMLButtonElement}}
 */
function createResetPrintingsButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sidebar-setting sidebar-reset-printings';
  button.textContent = 'Reset preferred printings';
  button.addEventListener('click', () => {
    resetPreferredPrintings();
    applyPreferredPrintings();
    showToast('Preferred printings cleared.', 'success');
  });
  return { el: button };
}

/** Re-read the stored settings into the controls and re-apply them to the page. */
function syncControls() {
  const modeSelect = document.querySelector('[data-setting="displayMode"]');
  if (modeSelect) modeSelect.value = getSetting('displayMode');

  const currencySelect = document.querySelector('[data-setting="currency"]');
  if (currencySelect) currencySelect.value = getCurrency();

  const swipeToggle = document.querySelector('[data-setting="swipeDismissToast"]');
  if (swipeToggle) swipeToggle.checked = Boolean(getSetting('swipeDismissToast'));

  updateCardStyles();
  handleDisplayModeChange(getSetting('displayMode'));
  // Settings pulled from the account may carry preferred printings; re-apply
  // them to the mounted tiles.
  applyPreferredPrintings();
  // Let the filter bar refresh its price labels (it may already be built).
  document.dispatchEvent(new CustomEvent('currency:changed'));
}

/**
 * Apply settings that changed elsewhere (e.g. pulled from the server) to the
 * controls and the page. Safe to call before the sidebar exists.
 */
export function applySettingsFromStore() {
  syncControls();
}

export function initCardSettings() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'sidebar-settings-container';

  const displayModePicker = createDisplayModePicker();
  const currencyPicker = createCurrencyPicker();
  const swipeToggle = createSettingToggle({
    setting: 'swipeDismissToast',
    label: ' Swipe to dismiss alerts',
  });
  const resetPrintings = createResetPrintingsButton();

  settingsContainer.append(
    displayModePicker.el,
    currencyPicker.el,
    swipeToggle.el,
    resetPrintings.el
  );
  sidebar.appendChild(settingsContainer);

  // Apply the stored settings to the page on load.
  syncControls();
}
