import { db } from "@/lib/db";
import type { PurchaseStatus, SubscriptionStatus, SubscriptionPeriod, ContentType } from "@prisma/client";

export type SerializedBot = {
  id: string;
  userId: string;
  name: string;
  username: string | null;
  telegramToken: string;
  description: string | null;
  isActive: boolean;
  webhookUrl: string | null;
  totalSubscribers: number;
  totalRevenue: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedBotWithUser = SerializedBot & {
  user: { id: string; name: string; email: string };
};

export type SerializedBotWithUserRole = SerializedBot & {
  user: { id: string; name: string; email: string; role: "owner" | "admin" | "creator" };
};

export type SerializedBotWithUserFull = SerializedBot & {
  user: { id: string; name: string; email: string; role: "owner" | "admin" | "creator"; platformFeePercent: number };
};

export type SerializedContent = {
  id: string;
  botId: string;
  userId: string;
  title: string;
  description: string | null;
  type: "image" | "video" | "file" | "bundle";
  price: number;
  originalKey: string;
  previewKey: string | null;
  originalUrl: string | null;
  previewUrl: string | null;
  isPublished: boolean;
  purchaseCount: number;
  totalRevenue: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedBotWithContent = SerializedBotWithUser & {
  content: SerializedContent[];
};

export type SerializedSubscriber = {
  id: string;
  botId: string;
  telegramUserId: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  totalSpent: string;
};

export async function getBotsByUserId(userId: string): Promise<SerializedBotWithUser[]> {
  const bots = await db.bot.findMany({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return bots.map((b) => ({
    ...b,
    totalRevenue: b.totalRevenue.toNumber(),
  }));
}

export async function getBotById(botId: string): Promise<SerializedBotWithUserFull | null> {
  const bot = await db.bot.findFirst({
    where: { id: botId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          platformFeePercent: true,
        },
      },
    },
  });

  if (!bot) return null;

  return {
    ...bot,
    totalRevenue: bot.totalRevenue.toNumber(),
    user: {
      ...bot.user,
      platformFeePercent: bot.user.platformFeePercent.toNumber(),
    },
  };
}

export async function getAllBots(): Promise<SerializedBotWithUserRole[]> {
  const bots = await db.bot.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return bots.map((b) => ({
    ...b,
    totalRevenue: b.totalRevenue.toNumber(),
  }));
}

export async function getBotWithContent(botId: string): Promise<SerializedBotWithContent | null> {
  const bot = await db.bot.findFirst({
    where: { id: botId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      content: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!bot) return null;

  return {
    ...bot,
    totalRevenue: bot.totalRevenue.toNumber(),
    content: bot.content.map((c) => ({
      ...c,
      price: c.price.toNumber(),
      totalRevenue: c.totalRevenue.toNumber(),
    })),
  };
}

export async function getBotSubscribers(
  botId: string,
  page: number,
  pageSize: number
): Promise<{
  subscribers: SerializedSubscriber[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const skip = (page - 1) * pageSize;

  const subscribers = await db.botUser.findMany({
    where: { botId },
    include: {
      purchases: {
        where: { status: "paid" },
        select: { amount: true },
      },
    },
    orderBy: { lastSeenAt: "desc" },
    skip,
    take: pageSize,
  });

  const total = await db.botUser.count({ where: { botId } });

  const subscribersWithTotals: SerializedSubscriber[] = subscribers.map((subscriber) => {
    const totalSpent = subscriber.purchases
      .reduce((acc: number, p) => acc + p.amount.toNumber(), 0)
      .toFixed(2);

    const { purchases: _, ...rest } = subscriber;
    return {
      ...rest,
      telegramUserId: Number(rest.telegramUserId),
      totalSpent,
    };
  });

  return {
    subscribers: subscribersWithTotals,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export type SerializedPurchaseDetail = {
  id: string;
  amount: number;
  platformFee: number;
  creatorNet: number;
  status: PurchaseStatus;
  paidAt: string | null;
  createdAt: string;
  content: {
    id: string;
    title: string;
    type: ContentType;
    price: number;
  };
};

export type SerializedSubscriptionDetail = {
  id: string;
  amount: number;
  platformFee: number;
  creatorNet: number;
  status: SubscriptionStatus;
  startDate: string | null;
  endDate: string | null;
  paidAt: string | null;
  createdAt: string;
  plan: {
    id: string;
    name: string;
    period: SubscriptionPeriod;
    price: number;
    benefits: unknown;
    includesLiveAccess: boolean;
  };
};

export type SerializedSubscriberDetail = {
  id: string;
  botId: string;
  telegramUserId: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  totalSpent: number;
  purchaseCount: number;
  purchases: SerializedPurchaseDetail[];
  subscriptions: SerializedSubscriptionDetail[];
};

export async function getBotSubscriberDetail(
  botId: string,
  subscriberId: string
): Promise<SerializedSubscriberDetail | null> {
  const subscriber = await db.botUser.findFirst({
    where: { id: subscriberId, botId },
    include: {
      purchases: {
        include: {
          content: {
            select: { id: true, title: true, type: true, price: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      subscriptions: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              period: true,
              price: true,
              benefits: true,
              includesLiveAccess: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!subscriber) return null;

  const totalSpent = subscriber.purchases
    .filter((p) => p.status === "paid")
    .reduce((acc, p) => acc + p.amount.toNumber(), 0);

  return {
    id: subscriber.id,
    botId: subscriber.botId,
    telegramUserId: Number(subscriber.telegramUserId),
    telegramUsername: subscriber.telegramUsername,
    telegramFirstName: subscriber.telegramFirstName,
    firstSeenAt: subscriber.firstSeenAt.toISOString(),
    lastSeenAt: subscriber.lastSeenAt.toISOString(),
    totalSpent,
    purchaseCount: subscriber.purchases.filter((p) => p.status === "paid").length,
    purchases: subscriber.purchases.map((p) => ({
      id: p.id,
      amount: p.amount.toNumber(),
      platformFee: p.platformFee.toNumber(),
      creatorNet: p.creatorNet.toNumber(),
      status: p.status,
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      content: {
        id: p.content.id,
        title: p.content.title,
        type: p.content.type,
        price: p.content.price.toNumber(),
      },
    })),
    subscriptions: subscriber.subscriptions.map((s) => ({
      id: s.id,
      amount: s.amount.toNumber(),
      platformFee: s.platformFee.toNumber(),
      creatorNet: s.creatorNet.toNumber(),
      status: s.status,
      startDate: s.startDate?.toISOString() ?? null,
      endDate: s.endDate?.toISOString() ?? null,
      paidAt: s.paidAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      plan: {
        id: s.plan.id,
        name: s.plan.name,
        period: s.plan.period,
        price: s.plan.price.toNumber(),
        benefits: s.plan.benefits,
        includesLiveAccess: s.plan.includesLiveAccess,
      },
    })),
  };
}
