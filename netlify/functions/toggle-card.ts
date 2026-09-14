import type { HandlerEvent } from '@netlify/functions';
import { getUserId, unauthorized } from '../utils/auth';
import { setOwned } from '../utils/ownedCards';

export async function handler(event: HandlerEvent) {
  const userId = await getUserId(event);
  if (!userId) return unauthorized();

  const { cardId, isOwned } = JSON.parse(event.body || '{}');

  if (!cardId) {
    return { statusCode: 400 };
  }

  await setOwned(userId, [cardId], isOwned);

  return {
    statusCode: 200,
    body: JSON.stringify({ isOwned }),
  };
}
