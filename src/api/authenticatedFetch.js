import { getClerk } from '../auth/clerk.js';

/**
 * Fetch wrapper that attaches the Clerk session token (when available) so
 * Netlify functions can verify the caller. Guest/share requests simply carry no
 * Authorization header.
 */
export async function authenticatedFetch(url, options = {}) {
  const clerk = getClerk();
  const token = await clerk.session?.getToken();

  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
