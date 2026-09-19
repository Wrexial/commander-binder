// src/ui/components/settingsModal.js
/**
 * The settings dialog. Gathers every user preference — display mode, price
 * currency, grid dimensions, binder capacity and the swipe-to-dismiss
 * behaviour — in one place, plus the preferred-printings reset.
 *
 * Layout changes rebuild the grid immediately (see `applyGridSettings`), since
 * section and binder sizes are baked into the DOM.
 */
import { getSetting, setSetting } from '../../state/cardSettings.js';
import { resetPreferredPrintings } from '../../state/preferredPrintings.js';
import { applyCurrencyChange, applyGridSettings, handleDisplayModeChange } from '../settingsUI.js';
import { applyPreferredPrintings } from '../cards.js';
import { CURRENCY_OPTIONS, getCurrency } from '../../utils/prices.js';
import { showToast } from './toast.js';
import { createModal } from './modal.js';

/** Tile layouts offered by the display-mode picker, in display order. */
const DISPLAY_MODE_OPTIONS = [
  { value: 'images', label: 'Images' },
  { value: 'text', label: 'Text only' },
  { value: 'list', label: 'List' },
];

/** Grid columns and rows; a page (section) holds columns x rows cards. */
const GRID_COLUMN_OPTIONS = [3, 4, 5, 6, 7, 8];
const GRID_ROW_OPTIONS = [2, 3, 4, 5, 6, 7, 8];

/** Pages in one binder. The physical albums collectors use come in these sizes. */
const PAGES_PER_BINDER_OPTIONS = [8, 16, 32, 64, 128];

/** A titled block of related settings. */
function createSettingsGroup(title) {
  const group = document.createElement('section');
  group.className = 'settings-group';

  const heading = document.createElement('h3');
  heading.className = 'settings-group-title';
  heading.textContent = title;
  group.appendChild(heading);

  return group;
}

/**
 * A label + control row. `options` may be primitives or `{value, label}` pairs.
 *
 * @param {object} config
 * @param {string} config.label
 * @param {string} [config.hint]
 * @param {string} config.ariaLabel
 * @param {Array<*>} config.options
 * @param {*} config.value
 * @param {(value: *) => void} config.onChange
 * @returns {HTMLElement}
 */
function createSelectRow({ label, hint, ariaLabel, options, value, onChange }) {
  const row = document.createElement('label');
  row.className = 'settings-row';

  const text = document.createElement('span');
  text.className = 'settings-row-text';

  const labelEl = document.createElement('span');
  labelEl.className = 'settings-row-label';
  labelEl.textContent = label;
  text.appendChild(labelEl);

  if (hint) {
    const hintEl = document.createElement('span');
    hintEl.className = 'settings-row-hint';
    hintEl.textContent = hint;
    text.appendChild(hintEl);
  }

  const select = document.createElement('select');
  select.className = 'settings-select';
  select.setAttribute('aria-label', ariaLabel);
  for (const option of options) {
    const opt = document.createElement('option');
    opt.value = String(option?.value ?? option);
    opt.textContent = String(option?.label ?? option);
    select.appendChild(opt);
  }
  select.value = String(value);

  select.addEventListener('change', () => {
    const raw = select.value;
    const numeric = Number(raw);
    onChange(raw !== '' && Number.isFinite(numeric) ? numeric : raw);
  });

  row.append(text, select);
  return row;
}

/** A label + checkbox row bound to a stored boolean setting. */
function createToggleRow({ label, setting }) {
  const row = document.createElement('label');
  row.className = 'settings-row settings-row-toggle';

  const labelEl = document.createElement('span');
  labelEl.className = 'settings-row-label';
  labelEl.textContent = label;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(getSetting(setting));
  checkbox.addEventListener('change', () => setSetting(setting, checkbox.checked));

  row.append(labelEl, checkbox);
  return row;
}

/**
 * Build the settings modal.
 *
 * @returns {{show: () => void, close: () => void}}
 */
export function createSettingsModal() {
  const { modal, show, close } = createModal({
    className: 'settings-modal',
    ariaLabel: 'Settings',
  });

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';
  const heading = document.createElement('h2');
  heading.textContent = 'Settings';
  header.appendChild(heading);
  modal.appendChild(header);

  const content = document.createElement('div');
  content.className = 'modal-content-area settings-content';
  modal.appendChild(content);

  // --- Display -----------------------------------------------------------
  const displayGroup = createSettingsGroup('Display');
  displayGroup.appendChild(
    createSelectRow({
      label: 'Card display',
      ariaLabel: 'Card display mode',
      options: DISPLAY_MODE_OPTIONS,
      value: getSetting('displayMode'),
      onChange: (value) => {
        setSetting('displayMode', value);
        handleDisplayModeChange(value);
      },
    })
  );

  displayGroup.appendChild(
    createSelectRow({
      label: 'Price currency',
      ariaLabel: 'Price currency',
      options: CURRENCY_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
      value: getCurrency(),
      onChange: (value) => {
        setSetting('currency', value);
        applyCurrencyChange();
      },
    })
  );
  content.appendChild(displayGroup);

  // --- Grid & binders ----------------------------------------------------
  const gridGroup = createSettingsGroup('Grid & binders');

  const cardsPerPage = document.createElement('p');
  cardsPerPage.className = 'settings-readout';
  const updateCardsPerPage = () => {
    const columns = getSetting('gridColumns');
    const rows = getSetting('gridRows');
    cardsPerPage.textContent = `Each page shows ${columns * rows} cards (${columns} x ${rows}).`;
  };

  gridGroup.appendChild(
    createSelectRow({
      label: 'Columns',
      ariaLabel: 'Grid columns',
      options: GRID_COLUMN_OPTIONS,
      value: getSetting('gridColumns'),
      onChange: (value) => {
        setSetting('gridColumns', value);
        updateCardsPerPage();
        applyGridSettings();
      },
    })
  );

  gridGroup.appendChild(
    createSelectRow({
      label: 'Rows',
      ariaLabel: 'Grid rows',
      options: GRID_ROW_OPTIONS,
      value: getSetting('gridRows'),
      onChange: (value) => {
        setSetting('gridRows', value);
        updateCardsPerPage();
        applyGridSettings();
      },
    })
  );

  gridGroup.appendChild(cardsPerPage);
  updateCardsPerPage();

  gridGroup.appendChild(
    createSelectRow({
      label: 'Pages per binder',
      hint: 'How many pages before a new binder starts.',
      ariaLabel: 'Pages per binder',
      options: PAGES_PER_BINDER_OPTIONS,
      value: getSetting('pagesPerBinder'),
      onChange: (value) => {
        setSetting('pagesPerBinder', value);
        applyGridSettings();
      },
    })
  );
  content.appendChild(gridGroup);

  // --- Behaviour ---------------------------------------------------------
  const behaviourGroup = createSettingsGroup('Behaviour');
  behaviourGroup.appendChild(
    createToggleRow({ label: 'Swipe to dismiss alerts', setting: 'swipeDismissToast' })
  );

  const resetPrintings = document.createElement('button');
  resetPrintings.type = 'button';
  resetPrintings.className = 'settings-reset-printings';
  resetPrintings.textContent = 'Reset preferred printings';
  resetPrintings.addEventListener('click', () => {
    resetPreferredPrintings();
    applyPreferredPrintings();
    showToast('Preferred printings cleared.', 'success');
  });
  behaviourGroup.appendChild(resetPrintings);
  content.appendChild(behaviourGroup);

  // --- Footer ------------------------------------------------------------
  const footer = document.createElement('div');
  footer.className = 'modal-button-container';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', close);
  footer.appendChild(closeButton);
  modal.appendChild(footer);

  return { show, close };
}
