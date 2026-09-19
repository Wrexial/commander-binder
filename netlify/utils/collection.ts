import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { ownedCards, wishlistCards } from '../../db/schema';

/** The independent card collections a user can track. */
export type CollectionKind = 'owned' | 'wishlist';

/**
 * `wishlist_cards` is an exact structural mirror of `owned_cards`, so the
 * shared insert/delete logic can treat either table as the owned one.
 */
export type CollectionTable = typeof ownedCards;

const TABLES: Record<CollectionKind, CollectionTable> = {
  owned: ownedCards,
  wishlist: wishlistCards as unknown as CollectionTable,
};

/** The Drizzle table backing a collection kind. */
export function collectionTable(kind: CollectionKind): CollectionTable {
  return TABLES[kind];
}

/**
 * Add or remove a set of card printings from one of a user's collections.
 * Shared by the single-card and batch toggle handlers for every collection.
 */
export async function setCollection(
  kind: CollectionKind,
  userId: string,
  cardIds: string[],
  isPresent: boolean
): Promise<void> {
  const table = TABLES[kind];

  if (isPresent) {
    await db
      .insert(table)
      .values(cardIds.map((cardId) => ({ userId, cardId })))
      .onConflictDoNothing();
    return;
  }

  await db.delete(table).where(and(eq(table.userId, userId), inArray(table.cardId, cardIds)));
}
