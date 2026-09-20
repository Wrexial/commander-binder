// src/state/onboarding.js
/**
 * First-run flags that outlive the tab (unlike `viewState.js`, which is
 * per-tab scroll/search state). Storage is best-effort: if it is unavailable
 * the guest welcome simply shows again next visit.
 */
const GUEST_WELCOME_KEY = 'guestWelcomeDismissed';
const TOUR_KEY = 'appTourDone';

export function isGuestWelcomeDismissed() {
  try {
    return localStorage.getItem(GUEST_WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissGuestWelcome() {
  try {
    localStorage.setItem(GUEST_WELCOME_KEY, '1');
  } catch {
    /* storage unavailable — the welcome just reappears */
  }
}

/** True once the first-run tour has been finished or skipped. */
export function isTourDone() {
  try {
    return localStorage.getItem(TOUR_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remember that the tour is no longer needed (finished or skipped). */
export function markTourDone() {
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch {
    /* storage unavailable — the tour may reappear next visit */
  }
}
