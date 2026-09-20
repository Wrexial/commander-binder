import type { HandlerEvent } from '@netlify/functions';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { getUserId, unauthorized } from './auth';
import { type CollectionKind, collectionTable, setCollection } from './collection';
import { parseCardIds } from './mergeOwned';
import { MAX_BATCH_SIZE, badRequest, parseJsonBody } from './request';
import { resolveReadUser } from './share';

/**
 * Read a collection. A `shareToken` is an explicit read-only capability and
 * takes precedence over the caller's session (mirroring `owned-cards`), so
 * friends opening a share link see the owner's wishlist too.
 */
export async function readCollection(event: HandlerEvent, kind: CollectionKind) {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const resolved = await resolveReadUser(event, parsed.value.shareToken);
  if (!resolved.ok) return resolved.response;
  const { userId } = resolved;

  const table = collectionTable(kind);
  const rows = await db
    .select({ cardId: table.cardId, createdAt: table.createdAt })
    .from(table)
    .where(eq(table.userId, userId));

  return {
    statusCode: 200,
    body: JSON.stringify(rows),
  };
}

/** Toggle a single printing in a collection for the verified caller. */
export async function toggleCollection(event: HandlerEvent, kind: CollectionKind) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const { cardId, isOwned } = parsed.value;

  if (typeof cardId !== 'string' || cardId.length === 0) {
    return badRequest("'cardId' must be a non-empty string.");
  }
  if (typeof isOwned !== 'boolean') {
    return badRequest("'isOwned' must be a boolean.");
  }

  await setCollection(kind, userId, [cardId], isOwned);

  return { statusCode: 200, body: JSON.stringify({ isOwned }) };
}

/** Toggle a batch of printings in a collection for the verified caller. */
export async function batchToggleCollection(event: HandlerEvent, kind: CollectionKind) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const { cardIds, isOwned } = parsed.value;

  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return badRequest("'cardIds' must be a non-empty array.");
  }
  if (cardIds.length > MAX_BATCH_SIZE) {
    return badRequest(`'cardIds' is limited to ${MAX_BATCH_SIZE} entries.`);
  }

  const ids = cardIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length !== cardIds.length) {
    return badRequest("'cardIds' must contain non-empty strings.");
  }
  if (typeof isOwned !== 'boolean') {
    return badRequest("'isOwned' must be a boolean.");
  }

  await setCollection(kind, userId, ids, isOwned);

  return { statusCode: 200 };
}

/**
 * Additively merge a signed-out visitor's locally-stored collection into their
 * account for the requested kind. A share token is deliberately ignored so a
 * share-link visitor can never write into the owner's collection.
 */
export async function mergeCollection(event: HandlerEvent, kind: CollectionKind) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const cardIds = parseCardIds(parsed.value.cardIds);
  if (!cardIds.ok) return badRequest(cardIds.message);

  await setCollection(kind, userId, cardIds.ids, true);

  // Return the caller's full collection so the client can adopt server truth
  // without a second round trip.
  const table = collectionTable(kind);
  const rows = await db
    .select({ cardId: table.cardId, createdAt: table.createdAt })
    .from(table)
    .where(eq(table.userId, userId));

  return {
    statusCode: 200,
    body: JSON.stringify(rows),
  };
}
