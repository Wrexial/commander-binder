import { pgTable, text, primaryKey, timestamp, index } from 'drizzle-orm/pg-core';
import { cardLists } from './cardLists';

// Membership of a printing in a custom list. Mirrors `owned_cards` /
// `wishlist_cards` (printing id, no quantities), but keyed by `list_id` rather
// than `user_id`: the owning user is reached through `card_lists`. Deleting a
// list cascades its rows so orphans can never accumulate.
export const cardListItems = pgTable(
  'card_list_items',
  {
    listId: text('list_id')
      .notNull()
      .references(() => cardLists.id, { onDelete: 'cascade' }),
    cardId: text('card_id').notNull(),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.cardId] }),
    index('card_list_items_list_id_idx').on(table.listId),
  ]
);
