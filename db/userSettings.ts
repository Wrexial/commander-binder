import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: text("user_id").notNull(),
    settings: text("settings").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId] }),
  })
);
