import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type SerializedPurchase = {
  id: string;
  contentId: string;
  botId: string;
  botUserId: string;
  creatorUserId: string;
  amount: number;
  platformFee: number;
  creatorNet: number;
  pixTxid: string | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  status: string;
  paidAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  content: { id: string; title: string; type: string };
  bot: { id: string; name: string; username: string | null };
  botUser: { id: string; telegramUsername: string | null; telegramFirstName: string | null };
};

export async function getCreatorEarnings(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<SerializedPurchase[]> {
  const purchases = await db.purchase.findMany({
    where: {
      creatorUserId: userId,
      status: "paid",
      paidAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      content: {
        select: {
          id: true,
          title: true,
          type: true,
        },
      },
      bot: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      botUser: {
        select: {
          id: true,
          telegramUsername: true,
          telegramFirstName: true,
        },
      },
    },
    orderBy: { paidAt: "desc" },
  });

  return purchases.map((p) => ({
    ...p,
    amount: p.amount.toNumber(),
    platformFee: p.platformFee.toNumber(),
    creatorNet: p.creatorNet.toNumber(),
  }));
}

export async function getPlatformEarnings(startDate: Date, endDate: Date): Promise<SerializedPurchase[]> {
  const purchases = await db.purchase.findMany({
    where: {
      status: "paid",
      paidAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      content: {
        select: {
          id: true,
          title: true,
          type: true,
        },
      },
      bot: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      botUser: {
        select: {
          id: true,
          telegramUsername: true,
          telegramFirstName: true,
        },
      },
    },
    orderBy: { paidAt: "desc" },
  });

  return purchases.map((p) => ({
    ...p,
    amount: p.amount.toNumber(),
    platformFee: p.platformFee.toNumber(),
    creatorNet: p.creatorNet.toNumber(),
  }));
}

interface DailyEarningsRow {
  date: string;
  totalAmount: string;
  totalPlatformFee: string;
  totalCreatorNet: string;
  salesCount: number;
}

export async function getDailyEarnings(
  userId: string | null,
  startDate: Date,
  endDate: Date
): Promise<DailyEarningsRow[]> {
  if (userId !== null) {
    const rows = await db.$queryRaw<DailyEarningsRow[]>(Prisma.sql`
      SELECT
        DATE("paid_at")::text AS date,
        COALESCE(SUM(amount), 0)::text AS "totalAmount",
        COALESCE(SUM(platform_fee), 0)::text AS "totalPlatformFee",
        COALESCE(SUM(creator_net), 0)::text AS "totalCreatorNet",
        CAST(COUNT(*) AS INTEGER) AS "salesCount"
      FROM purchases
      WHERE status = 'paid'
        AND "paid_at" >= ${startDate}
        AND "paid_at" <= ${endDate}
        AND creator_user_id = ${userId}::uuid
      GROUP BY DATE("paid_at")
      ORDER BY DATE("paid_at") ASC
    `);
    return rows;
  }

  const rows = await db.$queryRaw<DailyEarningsRow[]>(Prisma.sql`
    SELECT
      DATE("paid_at")::text AS date,
      COALESCE(SUM(amount), 0)::text AS "totalAmount",
      COALESCE(SUM(platform_fee), 0)::text AS "totalPlatformFee",
      COALESCE(SUM(creator_net), 0)::text AS "totalCreatorNet",
      CAST(COUNT(*) AS INTEGER) AS "salesCount"
    FROM purchases
    WHERE status = 'paid'
      AND "paid_at" >= ${startDate}
      AND "paid_at" <= ${endDate}
    GROUP BY DATE("paid_at")
    ORDER BY DATE("paid_at") ASC
  `);
  return rows;
}

interface TopCreatorRow {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  totalRevenue: string;
  totalCreatorNet: string;
  totalSales: number;
  activeBots: number;
}

export async function getTopCreators(limit: number): Promise<TopCreatorRow[]> {
  return db.$queryRaw<TopCreatorRow[]>(Prisma.sql`
    SELECT
      u.id AS "userId",
      u.name,
      u.email,
      u.avatar_url AS "avatarUrl",
      COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)::text AS "totalRevenue",
      COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.creator_net ELSE 0 END), 0)::text AS "totalCreatorNet",
      CAST(COUNT(CASE WHEN p.status = 'paid' THEN 1 END) AS INTEGER) AS "totalSales",
      CAST(COUNT(DISTINCT CASE WHEN b.is_active = true THEN b.id END) AS INTEGER) AS "activeBots"
    FROM users u
    LEFT JOIN bots b ON b.user_id = u.id
    LEFT JOIN purchases p ON p.creator_user_id = u.id
    WHERE u.role = 'creator'
    GROUP BY u.id, u.name, u.email, u.avatar_url
    ORDER BY COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) DESC
    LIMIT ${limit}
  `);
}

interface TopBotRow {
  botId: string;
  name: string;
  username: string | null;
  isActive: boolean;
  creatorId: string;
  creatorName: string;
  totalRevenue: string;
  totalCreatorNet: string;
  totalSales: number;
  totalSubscribers: number;
}

export async function getTopBots(limit: number): Promise<TopBotRow[]> {
  return db.$queryRaw<TopBotRow[]>(Prisma.sql`
    SELECT
      b.id AS "botId",
      b.name,
      b.username,
      b.is_active AS "isActive",
      u.id AS "creatorId",
      u.name AS "creatorName",
      COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)::text AS "totalRevenue",
      COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.creator_net ELSE 0 END), 0)::text AS "totalCreatorNet",
      CAST(COUNT(CASE WHEN p.status = 'paid' THEN 1 END) AS INTEGER) AS "totalSales",
      b.total_subscribers AS "totalSubscribers"
    FROM bots b
    INNER JOIN users u ON u.id = b.user_id
    LEFT JOIN purchases p ON p.bot_id = b.id
    GROUP BY b.id, b.name, b.username, b.is_active, b.total_subscribers, u.id, u.name
    ORDER BY COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) DESC
    LIMIT ${limit}
  `);
}
