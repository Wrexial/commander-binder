const DEFAULT_SETTINGS = {
  showColors: true,
  showTooltip: true,
  showEdhrecLink: true,
  showDisabledCards: true,
  // persistentReveal: boolean — if true, EDHREC links are revealed by default
  persistentReveal: false,
};

const STORAGE_KEY = "cardSettings";

const _stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

export const cardSettings = {
  ...DEFAULT_SETTINGS,
  ..._stored
};

export function saveSettings() {
  const toSave = { ...cardSettings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}