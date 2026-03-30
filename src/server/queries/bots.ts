import { db } from "@/lib/db";

export async function getBotsByUserId(userId: string) {
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

export async function getBotById(botId: string) {
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

export async function getAllBots() {
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

export async function getBotWithContent(botId: string) {
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
) {
  const skip = (page - 1) * pageSize;

  const [subscribers, total] = await Promise.all([
    db.botUser.findMany({
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
    }),

    db.botUser.count({ where: { botId } }),
  ]);

  const subscribersWithTotals = subscribers.map((subscriber) => {
    const totalSpent = subscriber.purchases
      .reduce((acc, p) => acc + p.amount.toNumber(), 0)
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
