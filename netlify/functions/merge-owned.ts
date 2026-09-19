import type { HandlerEvent } from '@netlify/functions';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { ownedCards } from '../../db/schema';
import { getUserId, unauthorized } from '../utils/auth';
import { parseCardIds } from '../utils/mergeOwned';
import { setOwned } from '../utils/ownedCards';
import { badRequest, parseJsonBody } from '../utils/request';

/**
 * Additively merge a signed-out visitor's locally-stored collection into their
 * account. This is a union: it never removes anything, so re-running it (or
 * racing a normal toggle) is safe.
 *
 * A share token is deliberately ignored. A share-link visitor must not be able
 * to write into the owner's collection, so the caller is pinned to their
 * verified Clerk identity.
 */
export async function handler(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const cardIds = parseCardIds(parsed.value.cardIds);
  if (!cardIds.ok) return badRequest(cardIds.message);

  await setOwned(userId, cardIds.ids, true);

  // Return the caller's full collection so the client can adopt server truth
  // without a second round trip.
  const rows = await db
    .select({ cardId: ownedCards.cardId, createdAt: ownedCards.createdAt })
    .from(ownedCards)
    .where(eq(ownedCards.userId, userId));

  return {
    statusCode: 200,
    body: JSON.stringify(rows),
  };
}
