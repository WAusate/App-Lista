import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const catalogItemsTable = pgTable("catalog_items", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  emoji: text("emoji").notNull(),
  defaultQty: integer("default_qty").notNull().default(1),
  unit: text("unit").notNull().default("un"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCatalogItemSchema = createInsertSchema(catalogItemsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertCatalogItem = z.infer<typeof insertCatalogItemSchema>;
export type CatalogItem = typeof catalogItemsTable.$inferSelect;