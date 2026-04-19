import type {
  User as PrismaUser,
  Bot as PrismaBot,
  Content as PrismaContent,
  BotUser as PrismaBotUser,
  Purchase as PrismaPurchase,
  PlatformSetting as PrismaPlatformSetting,
  WelcomeMessage as PrismaWelcomeMessage,
  SubscriptionPlan as PrismaSubscriptionPlan,
  Subscription as PrismaSubscription,
  LiveStream as PrismaLiveStream,
  LiveStreamSession as PrismaLiveStreamSession,
  QaTask as PrismaQaTask,
  QaReport as PrismaQaReport,
  QaReportItem as PrismaQaReportItem,
  Solicitation as PrismaSolicitation,
  SolicitationComment as PrismaSolicitationComment,
  SolicitationAttachment as PrismaSolicitationAttachment,
} from "@prisma/client";

export type User = PrismaUser;
export type Bot = PrismaBot;
export type Content = PrismaContent;
export type BotUser = PrismaBotUser;
export type Purchase = PrismaPurchase;
export type PlatformSetting = PrismaPlatformSetting;
export type WelcomeMessage = PrismaWelcomeMessage;
export type SubscriptionPlan = PrismaSubscriptionPlan;
export type Subscription = PrismaSubscription;
export type LiveStream = PrismaLiveStream;
export type LiveStreamSession = PrismaLiveStreamSession;
export type LiveQualityTier = "SD" | "HD";
export type LiveSessionStatus = "live" | "ended" | "failed";
export type QaTask = PrismaQaTask;
export type QaReport = PrismaQaReport;
export type QaReportItem = PrismaQaReportItem;
export type Solicitation = PrismaSolicitation;
export type SolicitationComment = PrismaSolicitationComment;
export type SolicitationAttachment = PrismaSolicitationAttachment;

export type UserRole = "owner" | "admin" | "creator";
export type ContentType = "image" | "video" | "file" | "bundle";
export type PurchaseStatus = "pending" | "paid" | "expired" | "refunded";
export type SubscriptionPeriodType = "monthly" | "quarterly" | "semiannual" | "annual";
export type SubscriptionStatusType = "active" | "expired" | "cancelled";

export type ActionResponse<T = undefined> = {
  success: boolean;
  data?: T;
  error?: string;
};
