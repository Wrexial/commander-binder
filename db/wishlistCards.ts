import { pgTable, text, primaryKey, timestamp } from 'drizzle-orm/pg-core';

// Mirror of `owned_cards` for cards the user is hunting. Kept as a separate
// table rather than a status column on `owned_cards`: owned and wanted are
// independent sets (a card can be both or neither), and every existing
// "owned" query stays simple as a result.
export const wishlistCards = pgTable(
  'wishlist_cards',
  {
    userId: text('user_id').notNull(),
    cardId: text('card_id').notNull(),
    // When the card was marked wanted; drives "Recent additions" for wishlists.
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.cardId] })]
);
