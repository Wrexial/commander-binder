import { db } from "../../db";
import { ownedCards } from "../../db/schema";
import { and, eq } from "drizzle-orm";
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

  const { cardId, isOwned } = JSON.parse(event.body || "{}");

  if (!cardId) {
    return { statusCode: 400 };
  }

  if (isOwned) {
    await db
      .insert(ownedCards)
      .values({ userId, cardId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(ownedCards)
      .where(and(eq(ownedCards.userId, userId), eq(ownedCards.cardId, cardId)));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ isOwned }),
  };
}
