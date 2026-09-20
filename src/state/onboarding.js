// src/state/onboarding.js
/**
 * First-run flags that outlive the tab (unlike `viewState.js`, which is
 * per-tab scroll/search state). Storage is best-effort: if it is unavailable
 * the guest welcome simply shows again next visit.
 */
const GUEST_WELCOME_KEY = 'guestWelcomeDismissed';

/** The first-run tour is tracked per page, since each page is a different tour. */
const TOUR_KEYS = {
  browse: 'appTourDone',
  binder: 'binderTourDone',
};

function tourKey(tour) {
  return TOUR_KEYS[tour] || TOUR_KEYS.browse;
}

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

/** True once the given page's first-run tour has been finished or skipped. */
export function isTourDone(tour = 'browse') {
  try {
    return localStorage.getItem(tourKey(tour)) === '1';
  } catch {
    return false;
  }
}

/** Remember that the given page's tour is no longer needed. */
export function markTourDone(tour = 'browse') {
  try {
    localStorage.setItem(tourKey(tour), '1');
  } catch {
    /* storage unavailable — the tour may reappear next visit */
  }
}
