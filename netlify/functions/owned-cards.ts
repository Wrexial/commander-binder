import type { Context } from "@netlify/functions";
import { db } from "../../db";
import { ownedCards } from "../../db/schema";
import { eq } from "drizzle-orm";

export async function handler(event, context: Context) {
  const { user } = context.netlifyContext;
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

  const userId = user.sub;
  const rows = await db
    .select({ cardId: ownedCards.cardId })
    .from(ownedCards)
    .where(eq(ownedCards.userId, userId));

  return {
    statusCode: 200,
    body: JSON.stringify(rows),
  };
}
