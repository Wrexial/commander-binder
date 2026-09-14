// netlify/utils/auth.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL(process.env.VITE_CLERK_ISSUER_URL!));

async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Resolve the authenticated Clerk user id from an Authorization: Bearer token.
 * Returns null when the header is missing or the token fails verification, so
 * callers can decide how to respond (and never trust a user id from the body).
 */
export async function getUserId(event: { headers?: Record<string, string | undefined> }) {
  const token = event.headers?.authorization?.split(' ')[1];
  if (!token) return null;

  const user = await verifyToken(token);
  return typeof user?.sub === 'string' ? user.sub : null;
}

/** Standard response for a caller that is not authenticated. */
export function unauthorized() {
  return {
    statusCode: 401,
    body: JSON.stringify({ message: 'Unauthorized' }),
  };
}
