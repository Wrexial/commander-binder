import type { HandlerEvent } from '@netlify/functions';
import { getUserId, unauthorized } from '../utils/auth';
import { setOwned } from '../utils/ownedCards';

export async function handler(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const { cardIds, isOwned } = JSON.parse(event.body || '{}');

  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return { statusCode: 400 };
  }

  await setOwned(userId, cardIds, isOwned);

  return { statusCode: 200 };
}
