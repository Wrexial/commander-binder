import { getSetting, setSetting } from '../state/cardSettings.js';
import { updateCardStyles, applyDisplayMode } from './cards.js';

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
  return labelEl;
}

function handleDisplayModeChange(value) {
  document.body.classList.toggle('images-mode', value === 'images');
  applyDisplayMode();
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
  // The display-mode control stores a string ('text' | 'images').
  const displayModeToggle = createSettingToggle({
    setting: 'displayMode',
    label: ' Show card images',
    isChecked: (value) => value === 'images',
    toValue: (checked) => (checked ? 'images' : 'text'),
    onChange: handleDisplayModeChange,
  });

  settingsContainer.appendChild(showTooltipToggle);
  settingsContainer.appendChild(displayModeToggle);
  sidebar.appendChild(settingsContainer);

  // Apply the stored settings to the page on load.
  updateCardStyles();
  handleDisplayModeChange(getSetting('displayMode'));
}
