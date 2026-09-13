import { integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchaseHistoryTable = pgTable("purchase_history", {
  id: serial("id").primaryKey(),
  householdId: text("household_id").notNull(),
  itemName: text("item_name").notNull(),
  emoji: text("emoji").notNull().default("🛒"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
  priceCents: integer("price_cents"),
  quantity: real("quantity").notNull().default(1),
  unit: text("unit"),
  supermarket: text("supermarket"),
  source: text("source").notNull(),
  receiptId: text("receipt_id"),
});

export const insertPurchaseHistorySchema = createInsertSchema(purchaseHistoryTable).omit({
  id: true,
});
export type InsertPurchaseHistory = z.infer<typeof insertPurchaseHistorySchema>;
export type PurchaseHistory = typeof purchaseHistoryTable.$inferSelect;