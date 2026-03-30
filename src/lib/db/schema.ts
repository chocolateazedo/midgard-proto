import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  decimal,
  integer,
  bigint,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "creator"]);
export const contentTypeEnum = pgEnum("content_type", [
  "image",
  "video",
  "file",
  "bundle",
]);
export const purchaseStatusEnum = pgEnum("purchase_status", [
  "pending",
  "paid",
  "expired",
  "refunded",
]);

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("creator"),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  isActive: boolean("is_active").default(true),
  platformFeePercent: decimal("platform_fee_percent", {
    precision: 5,
    scale: 2,
  }).default("10.00"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  bots: many(bots),
  content: many(content),
  purchases: many(purchases),
}));

// ─── Bots ────────────────────────────────────────────────────────────────────

export const bots = pgTable("bots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }).unique(),
  telegramToken: varchar("telegram_token", { length: 500 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(false),
  webhookUrl: varchar("webhook_url", { length: 500 }),
  totalSubscribers: integer("total_subscribers").default(0),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const botsRelations = relations(bots, ({ one, many }) => ({
  user: one(users, { fields: [bots.userId], references: [users.id] }),
  content: many(content),
  botUsers: many(botUsers),
  purchases: many(purchases),
}));

// ─── Content ─────────────────────────────────────────────────────────────────

export const content = pgTable("content", {
  id: uuid("id").primaryKey().defaultRandom(),
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: contentTypeEnum("type").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  originalKey: varchar("original_key", { length: 500 }).notNull(),
  previewKey: varchar("preview_key", { length: 500 }),
  originalUrl: varchar("original_url", { length: 1000 }),
  previewUrl: varchar("preview_url", { length: 1000 }),
  isPublished: boolean("is_published").default(false),
  purchaseCount: integer("purchase_count").default(0),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contentRelations = relations(content, ({ one, many }) => ({
  bot: one(bots, { fields: [content.botId], references: [bots.id] }),
  user: one(users, { fields: [content.userId], references: [users.id] }),
  purchases: many(purchases),
}));

// ─── Bot Users (Telegram users) ─────────────────────────────────────────────

export const botUsers = pgTable(
  "bot_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    telegramUserId: bigint("telegram_user_id", { mode: "bigint" }).notNull(),
    telegramUsername: varchar("telegram_username", { length: 255 }),
    telegramFirstName: varchar("telegram_first_name", { length: 255 }),
    firstSeenAt: timestamp("first_seen_at").defaultNow(),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("bot_user_unique").on(table.botId, table.telegramUserId),
  ]
);

export const botUsersRelations = relations(botUsers, ({ one, many }) => ({
  bot: one(bots, { fields: [botUsers.botId], references: [bots.id] }),
  purchases: many(purchases),
}));

// ─── Purchases ───────────────────────────────────────────────────────────────

export const purchases = pgTable("purchases", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentId: uuid("content_id")
    .notNull()
    .references(() => content.id, { onDelete: "cascade" }),
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  botUserId: uuid("bot_user_id")
    .notNull()
    .references(() => botUsers.id, { onDelete: "cascade" }),
  creatorUserId: uuid("creator_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),
  creatorNet: decimal("creator_net", { precision: 10, scale: 2 }).notNull(),
  pixTxid: varchar("pix_txid", { length: 255 }).unique(),
  pixQrCode: text("pix_qr_code"),
  pixCopyPaste: text("pix_copy_paste"),
  status: purchaseStatusEnum("status").default("pending"),
  paidAt: timestamp("paid_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const purchasesRelations = relations(purchases, ({ one }) => ({
  content: one(content, {
    fields: [purchases.contentId],
    references: [content.id],
  }),
  bot: one(bots, { fields: [purchases.botId], references: [bots.id] }),
  botUser: one(botUsers, {
    fields: [purchases.botUserId],
    references: [botUsers.id],
  }),
  creatorUser: one(users, {
    fields: [purchases.creatorUserId],
    references: [users.id],
  }),
}));

// ─── Platform Settings ───────────────────────────────────────────────────────

export const platformSettings = pgTable("platform_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 255 }).unique().notNull(),
  value: text("value").notNull(),
  description: text("description"),
  isEncrypted: boolean("is_encrypted").default(false),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});
