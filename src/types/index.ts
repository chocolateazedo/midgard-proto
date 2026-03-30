import type { users, bots, content, botUsers, purchases } from "@/lib/db/schema";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;
export type Content = typeof content.$inferSelect;
export type NewContent = typeof content.$inferInsert;
export type BotUser = typeof botUsers.$inferSelect;
export type NewBotUser = typeof botUsers.$inferInsert;
export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;

export type UserRole = "owner" | "admin" | "creator";
export type ContentType = "image" | "video" | "file" | "bundle";
export type PurchaseStatus = "pending" | "paid" | "expired" | "refunded";

export type ActionResponse<T = undefined> = {
  success: boolean;
  data?: T;
  error?: string;
};
