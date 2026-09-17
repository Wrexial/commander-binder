// src/state/onboarding.js
/**
 * First-run flags that outlive the tab (unlike `viewState.js`, which is
 * per-tab scroll/search state). Storage is best-effort: if it is unavailable
 * the guest welcome simply shows again next visit.
 */
const GUEST_WELCOME_KEY = 'guestWelcomeDismissed';

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
