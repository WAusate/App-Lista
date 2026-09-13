import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shoppingItemsTable = pgTable(
  "shopping_items",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull(),
    catalogId: text("catalog_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    bought: boolean("bought").notNull().default(false),
    boughtAt: timestamp("bought_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    householdCatalogUnique: uniqueIndex("shopping_items_household_catalog_unique").on(
      table.householdId,
      table.catalogId,
    ),
  }),
);

export const insertShoppingItemSchema = createInsertSchema(shoppingItemsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertShoppingItem = z.infer<typeof insertShoppingItemSchema>;
export type ShoppingItem = typeof shoppingItemsTable.$inferSelect;