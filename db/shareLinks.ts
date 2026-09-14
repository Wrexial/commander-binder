import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// One revocable share token per user. Rotating the token invalidates every
// previously shared link. `user_id` is the primary key so a user can only ever
// have a single active share link.
export const shareLinks = pgTable('share_links', {
  userId: text('user_id').primaryKey(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
