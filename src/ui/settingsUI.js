// src/ui/settingsUI.js
/**
 * Applies stored preferences to the page. The controls themselves live in the
 * settings modal (`components/settingsModal.js`); this module owns the side
 * effects so a change from the modal, from a synced account blob or from first
 * paint all go through the same code path.
 */
import { getSetting } from '../state/cardSettings.js';
import { applyDisplayMode, applyPreferredPrintings, updateCardStyles } from './cards.js';
import { refreshGridLayout } from './cardFeed.js';
import { DEFAULT_GRID_COLUMNS, DEFAULT_GRID_ROWS } from '../config/constants.js';

/** Signature of the layout-affecting settings, used to detect real changes. */
function layoutSignature() {
  return [
    getSetting('gridColumns') ?? DEFAULT_GRID_COLUMNS,
    getSetting('gridRows') ?? DEFAULT_GRID_ROWS,
    getSetting('pagesPerBinder'),
  ].join('x');
}

/** The signature last applied to the page. */
let appliedLayoutSignature = '';

/** Publish the grid dimensions to CSS so the grid re-flows. */
export function applyLayoutVariables() {
  const columns = Number(getSetting('gridColumns')) || DEFAULT_GRID_COLUMNS;
  const root = document.documentElement;
  root.style.setProperty('--grid-columns', String(columns));
  // Image tiles get cramped on phones, so cap the mobile grid at three
  // columns no matter how wide the desktop grid is.
  root.style.setProperty('--grid-columns-mobile', String(Math.min(columns, 3)));
}

/**
 * Apply the layout settings to CSS, reporting whether they changed since the
 * last call. The caller decides whether a grid rebuild is needed.
 *
 * @returns {boolean} true when the layout settings changed
 */
function applyLayoutSettings() {
  const signature = layoutSignature();
  if (signature === appliedLayoutSignature) return false;
  appliedLayoutSignature = signature;
  applyLayoutVariables();
  return true;
}

/**
 * Re-render tiles after a display-mode change. Toggles the body classes the
 * stylesheet keys off and rebuilds the mounted cards.
 * @param {string} value 'images' | 'text' | 'list'
 */
export function handleDisplayModeChange(value) {
  document.body.classList.toggle('images-mode', value === 'images');
  document.body.classList.toggle('list-mode', value === 'list');
  applyDisplayMode();
}

/**
 * Re-render tiles and tell the filter bar the price unit changed. The cheapest
 * printing can change with the currency, so un-pinned art is re-resolved too.
 */
export function applyCurrencyChange() {
  applyDisplayMode();
  applyPreferredPrintings();
  document.dispatchEvent(new CustomEvent('currency:changed'));
}

/**
 * Apply layout settings and reflow the grid when they changed. Shared by the
 * modal and the server-pull path.
 */
export function applyGridSettings() {
  if (applyLayoutSettings()) refreshGridLayout();
}

/**
 * Apply settings that changed elsewhere (e.g. pulled from the server) to the
 * page. Rebuilds the grid only when a layout setting actually changed.
 */
export function applySettingsFromStore() {
  applyGridSettings();
  updateCardStyles();
  handleDisplayModeChange(getSetting('displayMode'));
  applyPreferredPrintings();
  // Let the filter bar refresh its price labels (it may already be built).
  document.dispatchEvent(new CustomEvent('currency:changed'));
}

/**
 * Apply the stored settings at startup, before the first cards render: publish
 * the grid dimensions and the display-mode body classes the stylesheet keys
 * off.
 */
export function initCardSettings() {
  applyLayoutVariables();
  appliedLayoutSignature = layoutSignature();
  handleDisplayModeChange(getSetting('displayMode'));
  updateCardStyles();
}
