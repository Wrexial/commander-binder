import { authenticatedFetch } from './authenticatedFetch.js';

const ENDPOINT = '/.netlify/functions/user-settings';

/**
 * Load the signed-in user's synced settings. Returns null when there is no
 * session, no stored settings, or the request fails — sync is best-effort and
 * must never block the app.
 *
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function loadUserSettings() {
  const res = await authenticatedFetch(ENDPOINT, { method: 'GET' });
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const settings = data?.settings;
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : null;
}

/**
 * Persist the signed-in user's settings. Resolves to false on failure so the
 * caller can decide whether to surface it.
 *
 * @param {Record<string, unknown>} settings
 * @returns {Promise<boolean>}
 */
export async function saveUserSettings(settings) {
  const res = await authenticatedFetch(ENDPOINT, {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
  return res.ok;
}
