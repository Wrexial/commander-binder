import { appState } from '../state/appState.js';

/** The loader is a persistent live region (see index.html); it is revealed
 *  with a class rather than `display` so its message is announced. */
function getLoader() {
  return document.getElementById('loading-indicator');
}

/** Auto-hide timer for the final "Done" tick, and its pending message. */
let doneTimer;
let pendingDone = null;

function hideLoader() {
  const loader = getLoader();
  if (loader) {
    loader.classList.remove('is-visible');
    loader.textContent = '';
  }
  const results = document.getElementById('results');
  if (results) results.setAttribute('aria-busy', 'false');
}

/** Show the queued final "Done" tick, then hide it after its dwell. */
function revealDone() {
  const { message, duration } = pendingDone;
  pendingDone = null;

  const loader = getLoader();
  if (loader) {
    loader.textContent = message;
    loader.classList.add('is-visible');
  }
  const results = document.getElementById('results');
  if (results) results.setAttribute('aria-busy', 'false');

  clearTimeout(doneTimer);
  doneTimer = setTimeout(hideLoader, duration);
}

export function showLoading(message = 'Loading cards…') {
  // A new load supersedes any pending/finished "Done" tick.
  clearTimeout(doneTimer);
  pendingDone = null;

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

  // The last load to finish shows the queued "Done" tick instead of vanishing.
  if (pendingDone) {
    revealDone();
    return;
  }

  hideLoader();
}

/**
 * Mark the initial load flow as finished. The next time the loader would hide it
 * shows `message` ("Done") for `duration` ms instead of vanishing — or, if a
 * load is still running, it waits for that to finish, so "Done" is always the
 * last state. A subsequent {@link showLoading} supersedes it.
 *
 * @param {string} [message]
 * @param {number} [duration]
 */
export function showDone(message = 'Done', duration = 1400) {
  pendingDone = { message, duration };
  if (appState.activeFetches === 0) revealDone();
}
