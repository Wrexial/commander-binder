import { db } from "../../db";
import { disabledCards } from "../../db/schema";
import { eq } from "drizzle-orm";

export async function handler(event) {
  const { userId } = JSON.parse(event.body || "{}");
  console.log(userId);
  const rows = await db
    .select({ cardId: disabledCards.cardId })
    .from(disabledCards)
    .where(eq(disabledCards.userId, userId));

  return {
    statusCode: 200,
    body: JSON.stringify(rows),
  };
}
