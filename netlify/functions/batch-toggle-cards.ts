import { db } from "../../db";
import { ownedCards } from "../../db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function handler(event) {
  const { userId, cardIds, isOwned } = JSON.parse(event.body || "{}");

  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return { statusCode: 400 };
  }

  if (isOwned) {
    await db
      .insert(ownedCards)
      .values(cardIds.map((cardId) => ({ userId, cardId })))
      .onConflictDoNothing();
  } else {
    await db
      .delete(ownedCards)
      .where(
        and(
          eq(ownedCards.userId, userId),
          inArray(ownedCards.cardId, cardIds)
        )
      );
  }

  return { statusCode: 200 };
}
