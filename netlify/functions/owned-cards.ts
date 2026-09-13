import { eq } from "drizzle-orm";
import { db } from "../../db";
import { ownedCards, shareLinks } from "../../db/schema";
import { getUserId } from "../utils/auth";

export async function handler(event) {
  const { shareToken } = JSON.parse(event.body || "{}");

  let userId;

  if (shareToken) {
    // A share token is an explicit capability: honour it even when the caller
    // also has a session, so opening someone's share link shows *their*
    // collection and a rotated token stops resolving immediately.
    const [row] = await db
      .select({ userId: shareLinks.userId })
      .from(shareLinks)
      .where(eq(shareLinks.token, shareToken));

    userId = row?.userId;
  } else {
    // No share token: signed-in callers are pinned to their verified identity.
    userId = await getUserId(event);
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
