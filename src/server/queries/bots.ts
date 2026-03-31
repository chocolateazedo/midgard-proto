import { db } from "@/lib/db";

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
