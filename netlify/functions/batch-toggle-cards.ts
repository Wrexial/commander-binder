import { db } from "../../db";
import { ownedCards } from "../../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { verifyToken } from "../utils/auth";

export async function handler(event) {
  const token = event.headers.authorization?.split(" ")[1];
  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

  const user = await verifyToken(token);
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }
  const userId = user.sub;
  const { cardIds, isOwned } = JSON.parse(event.body || "{}");

  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return { statusCode: 400 };
  }

  if (isOwned) {
    await db
      .insert(ownedCards)
      .values(cardIds.map((cardId) => ({ userId, cardId })))
      .onConflictDoNothing();
  } else {
    await db.delete(ownedCards).where(and(eq(ownedCards.userId, userId), inArray(ownedCards.cardId, cardIds)));
  }

  return { statusCode: 200 };
}
