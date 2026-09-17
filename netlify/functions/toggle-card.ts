import type { HandlerEvent } from '@netlify/functions';
import { getUserId, unauthorized } from '../utils/auth';
import { setOwned } from '../utils/ownedCards';
import { badRequest, parseJsonBody } from '../utils/request';

export async function handler(event: HandlerEvent) {
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

  await setOwned(userId, [cardId], isOwned);

  return {
    statusCode: 200,
    body: JSON.stringify({ isOwned }),
  };
}
