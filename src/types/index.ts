import type {
  User as PrismaUser,
  Bot as PrismaBot,
  Content as PrismaContent,
  BotUser as PrismaBotUser,
  Purchase as PrismaPurchase,
  PlatformSetting as PrismaPlatformSetting,
} from "@prisma/client";

export type User = PrismaUser;
export type Bot = PrismaBot;
export type Content = PrismaContent;
export type BotUser = PrismaBotUser;
export type Purchase = PrismaPurchase;
export type PlatformSetting = PrismaPlatformSetting;

export type UserRole = "owner" | "admin" | "creator";
export type ContentType = "image" | "video" | "file" | "bundle";
export type PurchaseStatus = "pending" | "paid" | "expired" | "refunded";

export type ActionResponse<T = undefined> = {
  success: boolean;
  data?: T;
  error?: string;
};
