import { pgTable, text, primaryKey } from 'drizzle-orm/pg-core';

export const ownedCards = pgTable(
  'owned_cards',
  {
    userId: text('user_id').notNull(),
    cardId: text('card_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.cardId] })]
);

export { userSettings } from './userSettings';
export { shareLinks } from './shareLinks';
