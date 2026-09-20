// src/api/registryClient.js
import { authenticatedFetch } from './authenticatedFetch.js';

/**
 * Build the request helper shared by the custom-list and binder clients.
 *
 * Every list/binder mutation returns the caller's full set (`{ lists: [...] }`
 * / `{ binders: [...] }`), so the helper POSTs a JSON body, unwraps that key
 * and — on failure — throws the server's message so callers can surface it.
 *
 * @param {string} responseKey `'lists'` or `'binders'`.
 * @returns {(path: string, body: object) => Promise<object[]>}
 */
export function createRegistryRequest(responseKey) {
  return async function request(path, body) {
    const res = await authenticatedFetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if (data && typeof data.message === 'string') message = data.message;
      } catch {
        /* non-JSON error body — keep the status message */
      }
      throw new Error(message);
    }

    const data = await res.json();
    return Array.isArray(data?.[responseKey]) ? data[responseKey] : [];
  };
}
