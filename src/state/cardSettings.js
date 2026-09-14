const DEFAULT_SETTINGS = {
  showTooltip: true,
  // displayMode: 'text' | 'images' — cards show their name or their artwork
  displayMode: 'images',
};

const STORAGE_KEY = 'cardSettings';

const _stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
// Drop the removed "Reveal EDHREC links" preference so it stops being re-saved.
delete _stored.persistentReveal;

export const cardSettings = {
  ...DEFAULT_SETTINGS,
  ..._stored,
};

export function getSetting(key) {
  return cardSettings[key];
}

export function setSetting(key, value) {
  cardSettings[key] = value;
  saveSettings();
}

export function saveSettings() {
  const toSave = { ...cardSettings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}
