import { getSetting, setSetting } from '../state/cardSettings.js';
import { updateCardStyles, applyDisplayMode } from './cards.js';

/** Tile layouts offered by the display-mode picker, in display order. */
const DISPLAY_MODE_OPTIONS = [
  { value: 'images', label: 'Images' },
  { value: 'text', label: 'Text only' },
  { value: 'list', label: 'List' },
];

/**
 * Build a labelled checkbox bound to a stored setting.
 *
 * @param {object} config
 * @param {string} config.setting Key in `cardSettings`.
 * @param {string} config.label Visible label text.
 * @param {(value: unknown) => boolean} [config.isChecked] Maps the stored value
 *   to the checkbox state (defaults to the value's truthiness).
 * @param {(checked: boolean) => unknown} [config.toValue] Maps the checkbox
 *   state back to the stored value (defaults to the boolean itself).
 * @param {(value: unknown) => void} [config.onChange] Side effect after saving.
 * @returns {{el: HTMLElement, input: HTMLInputElement}}
 */
function createSettingToggle({
  setting,
  label,
  isChecked = (value) => Boolean(value),
  toValue = (checked) => checked,
  onChange,
}) {
  const labelEl = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.setting = setting;
  checkbox.checked = isChecked(getSetting(setting));

  checkbox.addEventListener('change', (event) => {
    const value = toValue(event.target.checked);
    setSetting(setting, value);
    onChange?.(value);
  });

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

/** Re-read the stored settings into the controls and re-apply them to the page. */
function syncControls() {
  const toggle = document.querySelector('[data-setting="showTooltip"]');
  if (toggle) toggle.checked = Boolean(getSetting('showTooltip'));

  const select = document.querySelector('[data-setting="displayMode"]');
  if (select) select.value = getSetting('displayMode');

  updateCardStyles();
  handleDisplayModeChange(getSetting('displayMode'));
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

  // `showTooltip` is read live by the tooltip code, so it needs no side effect.
  const showTooltipToggle = createSettingToggle({
    setting: 'showTooltip',
    label: ' Show Tooltip',
  });
  const displayModePicker = createDisplayModePicker();

  settingsContainer.appendChild(showTooltipToggle.el);
  settingsContainer.appendChild(displayModePicker.el);
  sidebar.appendChild(settingsContainer);

  // Apply the stored settings to the page on load.
  syncControls();
}
