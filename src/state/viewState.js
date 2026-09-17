// src/state/viewState.js
/**
 * Per-tab view preferences that survive a reload: the active search query and
 * the last scroll offset.
 *
 * sessionStorage (not localStorage) is deliberate — these values describe where
 * you were in *this* tab, so they should neither leak across tabs nor outlive
 * the session. Storage is best-effort: private mode or disabled storage just
 * means the view resets on reload.
 */
const STORAGE_KEY = 'viewState';

function read() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function write(patch) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), ...patch }));
  } catch {
    /* storage unavailable — view state just won't persist */
  }
}

export function getSavedSearch() {
  const value = read().search;
  return typeof value === 'string' ? value : '';
}

export function saveSearch(query) {
  write({ search: query || '' });
}

export function getSavedScroll() {
  const value = read().scroll;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveScroll(offset) {
  const rounded = Math.round(Number(offset));
  write({ scroll: Number.isFinite(rounded) && rounded > 0 ? rounded : 0 });
}
