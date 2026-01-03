const DEFAULT_SETTINGS = {
  showColors: true,
  showTooltip: true,
  showEdhrecLink: true,
  showDisabledCards: true,
  // if true, EDHREC links are revealed by default on touch devices
  persistentRevealOnTouch: false,
};

const STORAGE_KEY = "cardSettings";

export const cardSettings = {
  ...DEFAULT_SETTINGS,
  ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
};

export function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cardSettings));
}