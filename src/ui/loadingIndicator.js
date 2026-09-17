import { appState } from '../state/appState.js';

/** The loader is a persistent live region (see index.html); it is revealed
 *  with a class rather than `display` so its message is announced. */
function getLoader() {
  return document.getElementById('loading-indicator');
}

export function showLoading() {
  appState.activeFetches++;

  const loader = getLoader();
  if (loader) {
    // Changing the text is what actually triggers the polite announcement;
    // toggling visibility alone is not reliably announced.
    loader.textContent = 'Loading cards…';
    loader.classList.add('is-visible');
  }

  // Tell assistive tech the grid is mid-update so it waits for the settled
  // state instead of announcing every page the feed streams in.
  const results = document.getElementById('results');
  if (results) results.setAttribute('aria-busy', 'true');
}

export function hideLoading() {
  appState.activeFetches--;
  if (appState.activeFetches > 0) return;
  appState.activeFetches = 0;

  const loader = getLoader();
  if (loader) {
    loader.classList.remove('is-visible');
    loader.textContent = '';
  }

  const results = document.getElementById('results');
  if (results) results.setAttribute('aria-busy', 'false');
}
