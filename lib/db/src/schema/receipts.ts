import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const receiptsTable = pgTable("receipts", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  qrUrl: text("qr_url").notNull(),
  supermarket: text("supermarket"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  totalCents: integer("total_cents"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

export const insertReceiptSchema = createInsertSchema(receiptsTable).omit({
  importedAt: true,
});
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receiptsTable.$inferSelect;