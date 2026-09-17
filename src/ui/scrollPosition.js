// src/ui/scrollPosition.js
import { getSavedScroll, saveScroll } from '../state/viewState.js';

/** Give up trying to reach the saved offset after this long. */
const RESTORE_TIMEOUT_MS = 8000;
/** How often to re-check whether the (async) grid is tall enough yet. */
const POLL_INTERVAL_MS = 150;

let saveQueued = false;

/** Coalesce scroll writes to at most one per animation frame. */
function queueSave() {
  if (saveQueued) return;
  saveQueued = true;
  requestAnimationFrame(() => {
    saveQueued = false;
    saveScroll(window.scrollY);
  });
}

function startTracking() {
  window.addEventListener('scroll', queueSave, { passive: true });
  // rAF may never run before the tab is frozen/closed, so flush the final
  // position explicitly.
  window.addEventListener('pagehide', () => saveScroll(window.scrollY));
}

/**
 * Restore the previous scroll offset once enough of the asynchronously loaded
 * grid exists to reach it, then keep tracking changes. The saved offset is
 * abandoned the moment the user scrolls, so we never yank the page away from
 * them. Safe to call when there is nothing saved (it just starts tracking).
 */
export function initScrollPosition() {
  if ('scrollRestoration' in history) {
    // The browser would restore against a half-loaded grid; we do it ourselves.
    history.scrollRestoration = 'manual';
  }

  const target = getSavedScroll();
  if (target <= 0) {
    startTracking();
    return;
  }

  let finished = false;
  const startedAt = Date.now();

  const finish = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener('wheel', finish);
    window.removeEventListener('touchstart', finish);
    window.removeEventListener('keydown', finish);
    startTracking();
  };

  // Any deliberate input hands control back to the user immediately.
  window.addEventListener('wheel', finish, { passive: true, once: true });
  window.addEventListener('touchstart', finish, { passive: true, once: true });
  window.addEventListener('keydown', finish, { once: true });

  const attempt = () => {
    if (finished) return;

    if (document.documentElement.scrollHeight >= target + window.innerHeight) {
      window.scrollTo(0, target);
      finish();
      return;
    }
    if (Date.now() - startedAt >= RESTORE_TIMEOUT_MS) {
      finish();
      return;
    }
    setTimeout(attempt, POLL_INTERVAL_MS);
  };

  attempt();
}
