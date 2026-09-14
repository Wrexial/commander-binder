import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { ownedCards } from '../../db/schema';

/**
 * Add or remove a set of card printings from a user's collection. Shared by the
 * single-card and batch toggle handlers.
 */
export async function setOwned(userId: string, cardIds: string[], isOwned: boolean): Promise<void> {
  if (isOwned) {
    await db
      .insert(ownedCards)
      .values(cardIds.map((cardId) => ({ userId, cardId })))
      .onConflictDoNothing();
    return;
  }

  await db
    .delete(ownedCards)
    .where(and(eq(ownedCards.userId, userId), inArray(ownedCards.cardId, cardIds)));
}
