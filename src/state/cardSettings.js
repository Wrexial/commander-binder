const DEFAULT_SETTINGS = {
  showTooltip: true,
  // persistentReveal: boolean — if true, EDHREC links are revealed by default
  persistentReveal: false,
  // displayMode: 'text' | 'images' — cards show their name or their artwork
  displayMode: 'text',
};

const STORAGE_KEY = 'cardSettings';

const _stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

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
