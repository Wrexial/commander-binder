import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { shareLinks } from "../../db/schema";
import { getUserId } from "../utils/auth";

/**
 * Returns the caller's share token, creating one on first use. Passing
 * `{ regenerate: true }` rotates the token so previously shared links stop
 * working.
 */
export async function handler(event) {
  const userId = await getUserId(event);
  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

  const { regenerate } = JSON.parse(event.body || "{}");

  if (!regenerate) {
    const [existing] = await db
      .select({ token: shareLinks.token })
      .from(shareLinks)
      .where(eq(shareLinks.userId, userId));

    if (existing) {
      return {
        statusCode: 200,
        body: JSON.stringify({ token: existing.token }),
      };
    }
  }

  // 24 random bytes -> 32-char URL-safe token. Rotating replaces the old token
  // in place, so any link that embedded it immediately stops resolving.
  const token = randomBytes(24).toString("base64url");

  await db
    .insert(shareLinks)
    .values({ userId, token })
    .onConflictDoUpdate({
      target: shareLinks.userId,
      set: { token, updatedAt: new Date() },
    });

  return {
    statusCode: 200,
    body: JSON.stringify({ token }),
  };
}
