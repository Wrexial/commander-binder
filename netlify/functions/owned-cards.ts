import { db } from "../../db";
import { ownedCards } from "../../db/schema";
import { eq } from "drizzle-orm";

export async function handler(event) {
  const { userId } = JSON.parse(event.body || "{}");
  const rows = await db
    .select({ cardId: ownedCards.cardId })
    .from(ownedCards)
    .where(eq(ownedCards.userId, userId));

  return {
    statusCode: 200,
    body: JSON.stringify(rows),
  };
}
