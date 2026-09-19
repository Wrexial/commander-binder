const DEFAULT_SETTINGS = {
  // displayMode: 'text' | 'images' | 'list' — names, artwork, or a compact
  // checklist row with an inline ownership toggle.
  displayMode: 'images',
};

/** Accepted values per setting, so persisted/synced data can't inject junk. */
const SETTING_VALIDATORS = {
  displayMode: (value) => value === 'images' || value === 'text' || value === 'list',
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
