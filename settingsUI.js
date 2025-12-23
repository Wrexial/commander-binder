import { cardSettings, saveSettings } from "./cardSettings.js";

export function initCardSettings() {
  document
    .querySelectorAll("#card-settings input[data-setting]")
    .forEach(input => {
      const key = input.dataset.setting;
      input.checked = cardSettings[key];

      input.addEventListener("change", () => {
        cardSettings[key] = input.checked;
        saveSettings();
      });
    });
}
