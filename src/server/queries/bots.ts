import { db } from "@/lib/db";
import { bots, users, content, botUsers, purchases } from "@/lib/db/schema";
import { eq, desc, count, sum, sql } from "drizzle-orm";

export async function getBotsByUserId(userId: string) {
  return db.query.bots.findMany({
    where: eq(bots.userId, userId),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [desc(bots.createdAt)],
  });
}

export async function getBotById(botId: string) {
  return db.query.bots.findFirst({
    where: eq(bots.id, botId),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
          platformFeePercent: true,
        },
      },
    },
  });
}

export async function getAllBots() {
  return db.query.bots.findMany({
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: [desc(bots.createdAt)],
  });
}

export async function getBotWithContent(botId: string) {
  return db.query.bots.findFirst({
    where: eq(bots.id, botId),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      content: {
        orderBy: [desc(content.createdAt)],
      },
    },
  });
}

export async function getBotSubscribers(
  botId: string,
  page: number,
  pageSize: number
) {
  const offset = (page - 1) * pageSize;

  const [subscribers, totalResult] = await Promise.all([
    db
      .select({
        id: botUsers.id,
        botId: botUsers.botId,
        telegramUserId: botUsers.telegramUserId,
        telegramUsername: botUsers.telegramUsername,
        telegramFirstName: botUsers.telegramFirstName,
        firstSeenAt: botUsers.firstSeenAt,
        lastSeenAt: botUsers.lastSeenAt,
        totalSpent: sql<string>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.amount} ELSE 0 END), 0)`,
      })
      .from(botUsers)
      .leftJoin(purchases, eq(purchases.botUserId, botUsers.id))
      .where(eq(botUsers.botId, botId))
      .groupBy(
        botUsers.id,
        botUsers.botId,
        botUsers.telegramUserId,
        botUsers.telegramUsername,
        botUsers.telegramFirstName,
        botUsers.firstSeenAt,
        botUsers.lastSeenAt
      )
      .orderBy(desc(botUsers.lastSeenAt))
      .limit(pageSize)
      .offset(offset),

    db
      .select({ total: count() })
      .from(botUsers)
      .where(eq(botUsers.botId, botId)),
  ]);

  return {
    subscribers,
    total: totalResult[0]?.total ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((totalResult[0]?.total ?? 0) / pageSize),
  };
}
