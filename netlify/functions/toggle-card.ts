import { db } from "../../db";
import { disabledCards } from "../../db/schema";
import { and, eq } from "drizzle-orm";

export async function handler(event) {
  const { userId, cardId, disable } = JSON.parse(event.body || "{}");

  if (!cardId) {
    return { statusCode: 400 };
  }

  if (disable) {
    await db
      .insert(disabledCards)
      .values({ userId, cardId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(disabledCards)
      .where(
        and(
          eq(disabledCards.userId, userId),
          eq(disabledCards.cardId, cardId)
        )
      );
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ disabled: disable }),
  };
}
