// loader.js
import { state } from './state.js';

export function showLoading() {
  state.activeFetches++;
  const loader = document.getElementById("loading-indicator");
  if (loader) loader.style.display = "block";
}

export function hideLoading() {
  state.activeFetches--;
  if (state.activeFetches <= 0) {
    state.activeFetches = 0;
    const loader = document.getElementById("loading-indicator");
    if (loader) loader.style.display = "none";
  }
}
