import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// A user-authored Binder Builder layout: a named grid of physical pockets
// (`columns x rows` per page, `pages` pages). Slots are a sparse
// `"page:row:col" -> printing id` map stored as JSON text — like
// `user_settings.settings`, one self-contained column keeps the shape flexible
// without a join table per pocket.
//
// `id` is a client-visible UUID (not a serial) for the same reason as
// `card_lists`: a signed-out visitor creates binders locally and those ids never
// need to survive the merge (the server assigns a fresh id and the result is
// re-read).
export const binders = pgTable(
  'binders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    columns: integer('columns').default(3).notNull(),
    rows: integer('rows').default(3).notNull(),
    pages: integer('pages').default(1).notNull(),
    // Whether the binder is exposed through the owner's public share link.
    isPublic: boolean('is_public').default(false).notNull(),
    // JSON object `{ "0:0:0": "<printing id>", ... }`.
    slots: text('slots').default('{}').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Names are the user's handle on a binder, so they are unique per account;
    // this is also what makes the guest merge an idempotent union by name.
    uniqueIndex('binders_user_id_name_idx').on(table.userId, table.name),
    index('binders_user_id_idx').on(table.userId),
  ]
);
