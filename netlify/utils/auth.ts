// netlify/utils/auth.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL(process.env.VITE_CLERK_ISSUER_URL!));

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}
