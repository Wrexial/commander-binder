import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const disabledCards = sqliteTable(
  "disabled_cards",
  {
    userId: text("user_id").notNull(),
    cardId: text("card_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.cardId] }),
  })
);

export { userSettings } from "./userSettings";