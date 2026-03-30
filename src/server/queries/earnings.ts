import { db } from "@/lib/db";
import { purchases, users, bots, content } from "@/lib/db/schema";
import { eq, and, desc, asc, gte, lte, sql, count, sum, isNull } from "drizzle-orm";

export async function getCreatorEarnings(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  return db.query.purchases.findMany({
    where: and(
      eq(purchases.creatorUserId, userId),
      eq(purchases.status, "paid"),
      gte(purchases.paidAt, startDate),
      lte(purchases.paidAt, endDate)
    ),
    with: {
      content: {
        columns: {
          id: true,
          title: true,
          type: true,
        },
      },
      bot: {
        columns: {
          id: true,
          name: true,
          username: true,
        },
      },
      botUser: {
        columns: {
          id: true,
          telegramUsername: true,
          telegramFirstName: true,
        },
      },
    },
    orderBy: [desc(purchases.paidAt)],
  });
}

export async function getPlatformEarnings(startDate: Date, endDate: Date) {
  return db.query.purchases.findMany({
    where: and(
      eq(purchases.status, "paid"),
      gte(purchases.paidAt, startDate),
      lte(purchases.paidAt, endDate)
    ),
    with: {
      content: {
        columns: {
          id: true,
          title: true,
          type: true,
        },
      },
      bot: {
        columns: {
          id: true,
          name: true,
          username: true,
        },
      },
      botUser: {
        columns: {
          id: true,
          telegramUsername: true,
          telegramFirstName: true,
        },
      },
    },
    orderBy: [desc(purchases.paidAt)],
  });
}

export async function getDailyEarnings(
  userId: string | null,
  startDate: Date,
  endDate: Date
) {
  const conditions = [
    eq(purchases.status, "paid"),
    gte(purchases.paidAt, startDate),
    lte(purchases.paidAt, endDate),
  ];

  if (userId !== null) {
    conditions.push(eq(purchases.creatorUserId, userId));
  }

  const rows = await db
    .select({
      date: sql<string>`DATE(${purchases.paidAt})`,
      totalAmount: sql<string>`COALESCE(SUM(${purchases.amount}), '0')`,
      totalPlatformFee: sql<string>`COALESCE(SUM(${purchases.platformFee}), '0')`,
      totalCreatorNet: sql<string>`COALESCE(SUM(${purchases.creatorNet}), '0')`,
      salesCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
    })
    .from(purchases)
    .where(and(...conditions))
    .groupBy(sql`DATE(${purchases.paidAt})`)
    .orderBy(asc(sql`DATE(${purchases.paidAt})`));

  return rows;
}

export async function getTopCreators(limit: number) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      totalRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.amount} ELSE 0 END), '0')`,
      totalCreatorNet: sql<string>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.creatorNet} ELSE 0 END), '0')`,
      totalSales: sql<number>`CAST(COUNT(CASE WHEN ${purchases.status} = 'paid' THEN 1 END) AS INTEGER)`,
      activeBots: sql<number>`CAST(COUNT(DISTINCT CASE WHEN ${bots.isActive} = true THEN ${bots.id} END) AS INTEGER)`,
    })
    .from(users)
    .leftJoin(bots, eq(bots.userId, users.id))
    .leftJoin(purchases, eq(purchases.creatorUserId, users.id))
    .where(eq(users.role, "creator"))
    .groupBy(users.id, users.name, users.email, users.avatarUrl)
    .orderBy(
      desc(
        sql`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.amount} ELSE 0 END), 0)`
      )
    )
    .limit(limit);
}

export async function getTopBots(limit: number) {
  return db
    .select({
      botId: bots.id,
      name: bots.name,
      username: bots.username,
      isActive: bots.isActive,
      creatorId: users.id,
      creatorName: users.name,
      totalRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.amount} ELSE 0 END), '0')`,
      totalCreatorNet: sql<string>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.creatorNet} ELSE 0 END), '0')`,
      totalSales: sql<number>`CAST(COUNT(CASE WHEN ${purchases.status} = 'paid' THEN 1 END) AS INTEGER)`,
      totalSubscribers: bots.totalSubscribers,
    })
    .from(bots)
    .innerJoin(users, eq(users.id, bots.userId))
    .leftJoin(purchases, eq(purchases.botId, bots.id))
    .groupBy(
      bots.id,
      bots.name,
      bots.username,
      bots.isActive,
      bots.totalSubscribers,
      users.id,
      users.name
    )
    .orderBy(
      desc(
        sql`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.amount} ELSE 0 END), 0)`
      )
    )
    .limit(limit);
}
