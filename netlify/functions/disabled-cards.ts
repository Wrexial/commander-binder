import type { Context } from "@netlify/functions";
import { db } from "../../db";
import { ownedCards } from "../../db/schema";
import { eq } from "drizzle-orm";

export async function handler(event, context: Context) {
  let userId;
  const { user } = context.netlifyContext || {};

  if (user) {
    userId = user.sub;
  } else {
    const body = JSON.parse(event.body || "{}");
    userId = body.userId;
  }

  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

  const rows = await db
    .select({ cardId: ownedCards.cardId })
    .from(ownedCards)
    .where(eq(ownedCards.userId, userId));

  return {
    statusCode: 200,
    body: JSON.stringify(rows),
  };
}
