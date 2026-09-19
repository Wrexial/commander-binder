import { pgTable, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

// A user's custom, named groupings ("Trade pile", "Deck: Atraxa"). Unlike a
// physical binder — which is only a page of the paginated grid — these are
// semantic and user-authored, so they get their own table plus a membership
// join table (`cardListItems`). Notes live on the list itself: a deck's plan
// or a trade pile's terms belong to the group, not to any one card.
//
// `id` is a client-visible UUID (not a serial) because signed-out visitors
// create lists locally and those ids never need to survive the merge: the
// server always assigns a fresh id and the merge result is re-read.
export const cardLists = pgTable(
  'card_lists',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    notes: text('notes').default('').notNull(),
    // Whether the list is exposed through the owner's public share link.
    isPublic: boolean('is_public').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Names are the user's handle on a list, so they must be unique per account
    // (this is also what makes the guest merge an idempotent union by name).
    uniqueIndex('card_lists_user_id_name_idx').on(table.userId, table.name),
    index('card_lists_user_id_idx').on(table.userId),
  ]
);
