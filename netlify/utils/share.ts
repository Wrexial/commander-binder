// netlify/utils/share.ts
import type { HandlerEvent } from '@netlify/functions';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { shareLinks } from '../../db/schema';
import { getUserId, unauthorized } from './auth';
import { type HandlerResponse, badRequest } from './request';

/**
 * Resolve the user a read endpoint should answer for.
 *
 * A `shareToken` is an explicit read-only capability: when present it wins over
 * the caller's session, so a friend opening a share link sees the owner's data
 * without signing in. Otherwise the verified Clerk identity is used. Callers
 * that must hide private data (lists, binders) use `shared` to know they are in
 * the share view.
 *
 * @returns the resolved user id, or a ready-to-return error response.
 */
export async function resolveReadUser(
  event: HandlerEvent,
  shareToken: unknown
): Promise<
  { ok: true; userId: string; shared: boolean } | { ok: false; response: HandlerResponse }
> {
  let userId: string | null;
  let shared = false;

  if (shareToken) {
    if (typeof shareToken !== 'string') {
      return { ok: false, response: badRequest("'shareToken' must be a string.") };
    }

    const [row] = await db
      .select({ userId: shareLinks.userId })
      .from(shareLinks)
      .where(eq(shareLinks.token, shareToken));
    userId = row?.userId ?? null;
    shared = true;
  } else {
    userId = await getUserId(event);
  }

  if (!userId) return { ok: false, response: unauthorized() };

  return { ok: true, userId, shared };
}
