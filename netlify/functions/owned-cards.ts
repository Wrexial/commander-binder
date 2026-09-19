import type { HandlerEvent } from '@netlify/functions';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { ownedCards, shareLinks } from '../../db/schema';
import { getUserId, unauthorized } from '../utils/auth';
import { badRequest, parseJsonBody } from '../utils/request';

export async function handler(event: HandlerEvent) {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const { shareToken } = parsed.value;

  let userId;

  if (shareToken) {
    if (typeof shareToken !== 'string') {
      return badRequest("'shareToken' must be a string.");
    }

    // A share token is an explicit capability: honour it even when the caller
    // also has a session, so opening someone's share link shows *their*
    // collection and a rotated token stops resolving immediately.
    const [row] = await db
      .select({ userId: shareLinks.userId })
      .from(shareLinks)
      .where(eq(shareLinks.token, shareToken));

    userId = row?.userId;
  } else {
    // No share token: signed-in callers are pinned to their verified identity.
    userId = await getUserId(event);
  }

  if (!userId) {
    return unauthorized();
  }

  const rows = await db
    .select({ cardId: ownedCards.cardId, createdAt: ownedCards.createdAt })
    .from(ownedCards)
    .where(eq(ownedCards.userId, userId));

  return {
    statusCode: 200,
    body: JSON.stringify(rows),
  };
}
