// src/ui/components/settingsModal.js
/**
 * The settings dialog. Gathers every user preference — display mode, price
 * currency, grid dimensions, binder capacity and the swipe-to-dismiss
 * behaviour — in one place, plus the preferred-printings reset.
 *
 * Layout changes rebuild the grid immediately (see `applyGridSettings`), since
 * section and binder sizes are baked into the DOM.
 */
import {
  getSetting,
  setSetting,
  MAX_GRID_COLUMNS,
  MAX_GRID_ROWS,
  MAX_PAGES_PER_BINDER,
  MIN_GRID_COLUMNS,
  MIN_GRID_ROWS,
  MIN_PAGES_PER_BINDER,
} from '../../state/cardSettings.js';
import { resetPreferredPrintings } from '../../state/preferredPrintings.js';
import {
  applyCurrencyChange,
  applyDefaultPrintingChange,
  applyGridSettings,
  handleDisplayModeChange,
} from '../settingsUI.js';
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

/** Printings a card can default to when the user has not pinned one. */
const DEFAULT_PRINTING_OPTIONS = [
  { value: 'oldest', label: 'Oldest' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'most-expensive', label: 'Most expensive' },
  { value: 'full-art', label: 'Full art' },
];

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

/**
 * A label + segmented-button row for a small set of mutually exclusive choices.
 *
 * @param {object} config
 * @param {string} config.label
 * @param {string} [config.hint]
 * @param {string} config.ariaLabel
 * @param {{value: string, label: string}[]} config.options
 * @param {string} config.value
 * @param {(value: string) => void} config.onChange
 * @returns {HTMLElement}
 */
function createSegmentedRow({ label, hint, ariaLabel, options, value, onChange }) {
  const row = document.createElement('div');
  row.className = 'settings-row settings-row-segmented';

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

  const group = document.createElement('div');
  group.className = 'settings-segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', ariaLabel);

  let current = value;
  const buttons = new Map();
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-segment';
    button.textContent = option.label;
    button.setAttribute('aria-pressed', String(option.value === current));
    button.addEventListener('click', () => {
      if (option.value === current) return;
      current = option.value;
      for (const [optionValue, el] of buttons) {
        el.setAttribute('aria-pressed', String(optionValue === current));
      }
      onChange(current);
    });
    group.appendChild(button);
    buttons.set(option.value, button);
  }

  row.append(text, group);
  return row;
}

/**
 * A label + number-input row for the numeric layout settings.
 *
 * The value is clamped into `[min, max]` on commit, so a stray keystroke or a
 * cleared field can never persist an out-of-range preference. A cleared or
 * non-numeric field simply reverts to the current value.
 *
 * @param {object} config
 * @param {string} config.label
 * @param {string} [config.hint]
 * @param {string} config.ariaLabel
 * @param {number} config.min
 * @param {number} config.max
 * @param {number} config.value
 * @param {(value: number) => void} config.onChange
 * @returns {HTMLElement}
 */
function createNumberRow({ label, hint, ariaLabel, min, max, value, onChange }) {
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

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'settings-number';
  input.setAttribute('aria-label', ariaLabel);
  input.setAttribute('inputmode', 'numeric');
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);

  let current = value;

  const commit = () => {
    const raw = input.value.trim();
    const parsed = Number(raw);
    const next =
      raw === '' || !Number.isFinite(parsed)
        ? current
        : Math.min(max, Math.max(min, Math.round(parsed)));

    input.value = String(next);
    if (next === current) return;
    current = next;
    onChange(next);
  };

  input.addEventListener('change', commit);
  // Enter commits without making the user click/tab away first.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });

  row.append(text, input);
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
 * A miniature of one grid page. Re-rendering it on every columns/rows change
 * makes the density change tangible while the dialog is still open (the real
 * grid is behind the modal backdrop).
 *
 * @returns {{el: HTMLElement, render: () => void}}
 */
function createGridPreview() {
  const wrap = document.createElement('div');
  wrap.className = 'settings-grid-preview';

  const grid = document.createElement('div');
  grid.className = 'settings-grid-preview-grid';

  const caption = document.createElement('span');
  caption.className = 'settings-grid-preview-caption';

  wrap.append(grid, caption);

  function render() {
    const columns = Number(getSetting('gridColumns')) || 1;
    const rows = Number(getSetting('gridRows')) || 1;
    grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    grid.replaceChildren();
    for (let i = 0; i < columns * rows; i++) {
      const cell = document.createElement('span');
      cell.className = 'settings-grid-preview-cell';
      grid.appendChild(cell);
    }
    caption.textContent = `${columns} x ${rows} = ${columns * rows} cards per page`;
  }

  render();
  return { el: wrap, render };
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

  displayGroup.appendChild(
    createSegmentedRow({
      label: 'Default printing',
      hint: 'Which version to show by default. Full art includes showcase and borderless.',
      ariaLabel: 'Default printing',
      options: DEFAULT_PRINTING_OPTIONS,
      value: getSetting('defaultPrinting'),
      onChange: (value) => {
        setSetting('defaultPrinting', value);
        applyDefaultPrintingChange();
      },
    })
  );
  content.appendChild(displayGroup);

  // --- Grid & binders ----------------------------------------------------
  const gridGroup = createSettingsGroup('Grid & binders');

  const cardsPerPage = document.createElement('p');
  cardsPerPage.className = 'settings-readout';
  const gridPreview = createGridPreview();

  const syncGridReadout = () => {
    const columns = getSetting('gridColumns');
    const rows = getSetting('gridRows');
    cardsPerPage.textContent = `Each page shows ${columns * rows} cards (${columns} x ${rows}).`;
    gridPreview.render();
  };

  gridGroup.appendChild(
    createNumberRow({
      label: 'Columns',
      ariaLabel: 'Grid columns',
      min: MIN_GRID_COLUMNS,
      max: MAX_GRID_COLUMNS,
      value: getSetting('gridColumns'),
      onChange: (value) => {
        setSetting('gridColumns', value);
        syncGridReadout();
        applyGridSettings();
      },
    })
  );

  gridGroup.appendChild(
    createNumberRow({
      label: 'Rows',
      ariaLabel: 'Grid rows',
      min: MIN_GRID_ROWS,
      max: MAX_GRID_ROWS,
      value: getSetting('gridRows'),
      onChange: (value) => {
        setSetting('gridRows', value);
        syncGridReadout();
        applyGridSettings();
      },
    })
  );

  gridGroup.append(cardsPerPage, gridPreview.el);
  syncGridReadout();

  gridGroup.appendChild(
    createNumberRow({
      label: 'Pages per binder',
      hint: 'How many pages before a new binder starts.',
      ariaLabel: 'Pages per binder',
      min: MIN_PAGES_PER_BINDER,
      max: MAX_PAGES_PER_BINDER,
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
