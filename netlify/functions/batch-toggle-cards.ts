import type { HandlerEvent } from '@netlify/functions';
import { getUserId, unauthorized } from '../utils/auth';
import { setOwned } from '../utils/ownedCards';
import { badRequest, parseJsonBody, MAX_BATCH_SIZE } from '../utils/request';

export async function handler(event: HandlerEvent) {
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

  await setOwned(userId, ids, isOwned);

  return { statusCode: 200 };
}
