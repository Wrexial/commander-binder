import { db } from "../../db";
import { disabledCards } from "../../db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function handler(event) {
  const { userId, cardIds, disable } = JSON.parse(event.body || "{}");

  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return { statusCode: 400 };
  }

  if (disable) {
    await db
      .insert(disabledCards)
      .values(cardIds.map((cardId) => ({ userId, cardId })))
      .onConflictDoNothing();
  } else {
    await db
      .delete(disabledCards)
      .where(
        and(
          eq(disabledCards.userId, userId),
          inArray(disabledCards.cardId, cardIds)
        )
      );
  }

  return { statusCode: 200 };
}
