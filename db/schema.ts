import { pgTable, text, primaryKey, timestamp } from 'drizzle-orm/pg-core';

export const ownedCards = pgTable(
  'owned_cards',
  {
    userId: text('user_id').notNull(),
    cardId: text('card_id').notNull(),
    // When the card was marked owned; drives the "Recent additions" log.
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.cardId] })]
);

export { userSettings } from './userSettings';
export { shareLinks } from './shareLinks';
export { wishlistCards } from './wishlistCards';
export { cardLists } from './cardLists';
export { cardListItems } from './cardListItems';
