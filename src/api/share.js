import { authenticatedFetch } from './authenticatedFetch.js';

/**
 * Get the caller's share token, creating one on first use. Pass
 * `{ regenerate: true }` to rotate it and invalidate existing share links.
 */
export async function getShareToken({ regenerate = false } = {}) {
  const res = await authenticatedFetch('/.netlify/functions/share-link', {
    method: 'POST',
    body: JSON.stringify({ regenerate }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create share link (${res.status})`);
  }

  const { token } = await res.json();
  return token;
}
