// src/state/settingsSync.js
/**
 * Best-effort, cross-device sync of UI preferences through the `user-settings`
 * function. localStorage stays the source of truth for first paint; the server
 * copy is pulled once on sign-in and pushed (debounced) on every change.
 *
 * Only signed-in collectors sync. Guests and share-link visitors keep the
 * local-only behaviour, and a network failure is logged rather than surfaced.
 */
import { applySettings, cardSettings, onSettingsChange } from './cardSettings.js';
import { mainState } from './mainState.js';
import { loadUserSettings, saveUserSettings } from '../api/userSettings.js';
import { debounce } from '../utils/debounce.js';

const PUSH_DEBOUNCE_MS = 800;

let wired = false;

const pushRemote = debounce(() => {
  if (!mainState.loggedInUserId) return;
  saveUserSettings({ ...cardSettings }).catch((err) =>
    console.error('Failed to sync settings:', err)
  );
}, PUSH_DEBOUNCE_MS);

/** Start pushing local changes to the server. Idempotent. */
export function initSettingsSync() {
  if (wired) return;
  wired = true;

  onSettingsChange(() => {
    if (mainState.loggedInUserId) pushRemote();
  });
}

/**
 * Pull the account's settings and apply them locally.
 *
 * @returns {Promise<boolean>} true when at least one value changed.
 */
export async function pullSettings() {
  if (!mainState.loggedInUserId) return false;

  let remote;
  try {
    remote = await loadUserSettings();
  } catch (err) {
    console.error('Failed to load synced settings:', err);
    return false;
  }

  return remote ? applySettings(remote) : false;
}
