import { appState } from '../state/appState.js';

/** The loader is a persistent live region (see index.html); it is revealed
 *  with a class rather than `display` so its message is announced. */
function getLoader() {
  return document.getElementById('loading-indicator');
}

export function showLoading(message = 'Loading cards…') {
  appState.activeFetches++;

  const loader = getLoader();
  if (loader) {
    // Changing the text is what actually triggers the polite announcement;
    // toggling visibility alone is not reliably announced.
    loader.textContent = message;
    loader.classList.add('is-visible');
  }

  // Tell assistive tech the grid is mid-update so it waits for the settled
  // state instead of announcing every page the feed streams in.
  const results = document.getElementById('results');
  if (results) results.setAttribute('aria-busy', 'true');
}

/**
 * Run `task` with the loader showing `message` for its duration (paired with
 * {@link hideLoading} even when it throws). The boot flow uses this to narrate
 * what is loading; overlapping callers keep the loader up until the last one
 * finishes.
 *
 * @template T
 * @param {string} message
 * @param {() => T | Promise<T>} task
 * @returns {Promise<T>}
 */
export async function withLoading(message, task) {
  showLoading(message);
  try {
    return await task();
  } finally {
    hideLoading();
  }
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
