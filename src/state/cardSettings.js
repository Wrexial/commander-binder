import {
  DEFAULT_GRID_COLUMNS,
  DEFAULT_GRID_ROWS,
  DEFAULT_PAGES_PER_BINDER,
} from '../config/constants.js';

/**
 * Cap on remembered preferred printings. The list rides the 8 KB account
 * settings blob (`netlify/utils/userSettings.ts`) and printing ids are ~36
 * bytes each, so this keeps the sync comfortably under the limit while still
 * covering far more cards than a collector typically picks art for.
 */
export const MAX_PREFERRED_PRINTINGS = 150;

/** Grid dimensions stay in a range that keeps a tile legible on every viewport. */
export const MIN_GRID_COLUMNS = 2;
export const MAX_GRID_COLUMNS = 16;
export const MIN_GRID_ROWS = 2;
export const MAX_GRID_ROWS = 16;
/** Binder capacity (pages) is a positive count; the cap just rejects junk data. */
export const MIN_PAGES_PER_BINDER = 1;
export const MAX_PAGES_PER_BINDER = 200;

const DEFAULT_SETTINGS = {
  // displayMode: 'text' | 'images' | 'list' — names, artwork, or a compact
  // checklist row with an inline ownership toggle.
  displayMode: 'images',
  // Price currency shown on tiles, in statistics and used by the price filter:
  // 'eur' | 'usd' | 'tix' (MTGO tickets).
  currency: 'eur',
  // Swipe any direction on a toast (e.g. the undo prompt) to dismiss it early.
  swipeDismissToast: true,
  // Card-grid dimensions. One page (a section) shows `gridColumns` x
  // `gridRows` cards.
  gridColumns: DEFAULT_GRID_COLUMNS,
  gridRows: DEFAULT_GRID_ROWS,
  // How many pages make up one binder before a new binder starts.
  pagesPerBinder: DEFAULT_PAGES_PER_BINDER,
  // Card name -> chosen printing id. One entry per card, so cycling a name a
  // second time replaces the first pick rather than accumulating printings.
  preferredPrintings: {},
};

const isIntegerInRange = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;

/** Accepted values per setting, so persisted/synced data can't inject junk. */
const SETTING_VALIDATORS = {
  displayMode: (value) => value === 'images' || value === 'text' || value === 'list',
  currency: (value) => value === 'eur' || value === 'usd' || value === 'tix',
  swipeDismissToast: (value) => typeof value === 'boolean',
  gridColumns: (value) => isIntegerInRange(value, MIN_GRID_COLUMNS, MAX_GRID_COLUMNS),
  gridRows: (value) => isIntegerInRange(value, MIN_GRID_ROWS, MAX_GRID_ROWS),
  pagesPerBinder: (value) => isIntegerInRange(value, MIN_PAGES_PER_BINDER, MAX_PAGES_PER_BINDER),
  preferredPrintings: (value) =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length <= MAX_PREFERRED_PRINTINGS &&
    Object.entries(value).every(
      ([name, id]) => name.length > 0 && typeof id === 'string' && id.length > 0
    ),
};

const STORAGE_KEY = 'cardSettings';

/** Keep only known keys whose values validate. */
function sanitizeSettings(source) {
  const clean = {};
  if (!source || typeof source !== 'object') return clean;
  for (const [key, validate] of Object.entries(SETTING_VALIDATORS)) {
    if (key in source && validate(source[key])) clean[key] = source[key];
  }
  return clean;
}

const _stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

/** Live settings object; unknown/stale stored keys are dropped on load. */
export const cardSettings = {
  ...DEFAULT_SETTINGS,
  ...sanitizeSettings(_stored),
};

/** Subscribers notified on every change (used to push settings to the server). */
const listeners = new Set();

/**
 * Subscribe to setting changes. Returns an unsubscribe function.
 * @param {(settings: object) => void} listener
 */
export function onSettingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSetting(key) {
  return cardSettings[key];
}

/** Cards shown on one grid page (section): columns x rows. */
export function getCardsPerPage() {
  const columns = Number(getSetting('gridColumns')) || DEFAULT_GRID_COLUMNS;
  const rows = Number(getSetting('gridRows')) || DEFAULT_GRID_ROWS;
  return columns * rows;
}

/** Pages in one binder before the next binder begins. */
export function getPagesPerBinder() {
  return Number(getSetting('pagesPerBinder')) || DEFAULT_PAGES_PER_BINDER;
}

export function setSetting(key, value) {
  cardSettings[key] = value;
  saveSettings();
  for (const listener of listeners) listener(cardSettings);
}

export function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cardSettings }));
}

/**
 * Merge valid settings into the live object (e.g. after loading them from the
 * server) without notifying listeners, so applying a remote value can't echo
 * straight back. Unknown keys and invalid values are ignored.
 *
 * @param {object} patch
 * @returns {boolean} true when at least one value changed.
 */
export function applySettings(patch) {
  let changed = false;
  for (const [key, value] of Object.entries(sanitizeSettings(patch))) {
    if (cardSettings[key] !== value) {
      cardSettings[key] = value;
      changed = true;
    }
  }
  if (changed) saveSettings();
  return changed;
}
