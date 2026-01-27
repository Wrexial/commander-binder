// loader.js
import { appState } from '../state/appState.js';

export function showLoading() {
  appState.activeFetches++;
  const loader = document.getElementById("loading-indicator");
  if (loader) loader.style.display = "block";
}

export function hideLoading() {
  appState.activeFetches--;
  if (appState.activeFetches <= 0) {
    appState.activeFetches = 0;
    const loader = document.getElementById("loading-indicator");
    if (loader) loader.style.display = "none";
  }
}
