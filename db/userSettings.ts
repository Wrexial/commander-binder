import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  settings: text("settings").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
