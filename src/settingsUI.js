import { cardSettings, saveSettings } from "./cardSettings.js";
import { rerenderCards } from './cards.js';

export function initCardSettings(tooltip) {
  document
    .querySelectorAll("#card-settings [data-setting]")
    .forEach(el => {
      const key = el.dataset.setting;
      if (el.tagName === 'INPUT' && el.type === 'checkbox') {
        el.checked = Boolean(cardSettings[key]);
        el.addEventListener("change", () => {
          cardSettings[key] = el.checked;
          saveSettings();
          rerenderCards(tooltip);
        });
      } else if (el.tagName === 'SELECT') {
        el.value = cardSettings[key];
        el.addEventListener('change', () => {
          cardSettings[key] = el.value;
          saveSettings();
          rerenderCards(tooltip);
        });
      }
    });
}
