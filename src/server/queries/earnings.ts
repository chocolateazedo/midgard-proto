import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type SerializedPurchase = {
  id: string;
  botId: string;
  botUserId: string;
  creatorUserId: string;
  amount: number;
  platformFee: number;
  creatorNet: number;
  status: "pending" | "paid" | "expired" | "refunded";
  paidAt: Date | null;
  createdAt: Date;
  // kind="purchase" → conteúdo/live; kind="subscription" → plano.
  kind: "purchase" | "subscription";
  content: { id: string; title: string; type: string } | null;
  planName: string | null;
  bot: { id: string; name: string; username: string | null };
  botUser: { id: string; telegramUsername: string | null; telegramFirstName: string | null };
};

export async function getCreatorEarnings(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<SerializedPurchase[]> {
  const [purchases, subscriptions] = await Promise.all([
    db.purchase.findMany({
      where: {
        creatorUserId: userId,
        status: "paid",
        amount: { gt: 0 },
        paidAt: { gte: startDate, lte: endDate },
      },
      include: {
        content: { select: { id: true, title: true, type: true } },
        bot: { select: { id: true, name: true, username: true } },
        botUser: {
          select: { id: true, telegramUsername: true, telegramFirstName: true },
        },
      },
      orderBy: { paidAt: "desc" },
    }),
    db.subscription.findMany({
      where: {
        paidAt: { gte: startDate, lte: endDate },
        bot: { userId },
      },
      include: {
        plan: { select: { name: true } },
        bot: { select: { id: true, name: true, username: true, userId: true } },
        botUser: {
          select: { id: true, telegramUsername: true, telegramFirstName: true },
        },
      },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  return mergeEarnings(purchases, subscriptions);
}

export async function getPlatformEarnings(
  startDate: Date,
  endDate: Date
): Promise<SerializedPurchase[]> {
  const [purchases, subscriptions] = await Promise.all([
    db.purchase.findMany({
      where: {
        status: "paid",
        amount: { gt: 0 },
        paidAt: { gte: startDate, lte: endDate },
      },
      include: {
        content: { select: { id: true, title: true, type: true } },
        bot: { select: { id: true, name: true, username: true } },
        botUser: {
          select: { id: true, telegramUsername: true, telegramFirstName: true },
        },
      },
      orderBy: { paidAt: "desc" },
    }),
    db.subscription.findMany({
      where: { paidAt: { gte: startDate, lte: endDate } },
      include: {
        plan: { select: { name: true } },
        bot: { select: { id: true, name: true, username: true, userId: true } },
        botUser: {
          select: { id: true, telegramUsername: true, telegramFirstName: true },
        },
      },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  return mergeEarnings(purchases, subscriptions);
}

type PurchaseWithRelations = Awaited<ReturnType<typeof db.purchase.findMany<{
  include: {
    content: { select: { id: true; title: true; type: true } };
    bot: { select: { id: true; name: true; username: true } };
    botUser: { select: { id: true; telegramUsername: true; telegramFirstName: true } };
  };
}>>>[number];

type SubscriptionWithRelations = Awaited<ReturnType<typeof db.subscription.findMany<{
  include: {
    plan: { select: { name: true } };
    bot: { select: { id: true; name: true; username: true; userId: true } };
    botUser: { select: { id: true; telegramUsername: true; telegramFirstName: true } };
  };
}>>>[number];

function mergeEarnings(
  purchases: PurchaseWithRelations[],
  subscriptions: SubscriptionWithRelations[]
): SerializedPurchase[] {
  const fromPurchases: SerializedPurchase[] = purchases.map((p) => ({
    id: p.id,
    botId: p.botId,
    botUserId: p.botUserId,
    creatorUserId: p.creatorUserId,
    amount: p.amount.toNumber(),
    platformFee: p.platformFee.toNumber(),
    creatorNet: p.creatorNet.toNumber(),
    status: p.status,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    kind: "purchase",
    content: p.content,
    planName: null,
    bot: p.bot,
    botUser: p.botUser,
  }));

  const fromSubs: SerializedPurchase[] = subscriptions.map((s) => ({
    id: s.id,
    botId: s.botId,
    botUserId: s.botUserId,
    creatorUserId: s.bot.userId,
    amount: s.amount.toNumber(),
    platformFee: s.platformFee.toNumber(),
    creatorNet: s.creatorNet.toNumber(),
    status: "paid",
    paidAt: s.paidAt,
    createdAt: s.createdAt,
    kind: "subscription",
    content: null,
    planName: s.plan.name,
    bot: { id: s.bot.id, name: s.bot.name, username: s.bot.username },
    botUser: s.botUser,
  }));

  return [...fromPurchases, ...fromSubs].sort((a, b) => {
    const at = a.paidAt?.getTime() ?? a.createdAt.getTime();
    const bt = b.paidAt?.getTime() ?? b.createdAt.getTime();
    return bt - at;
  });
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
        date,
        COALESCE(SUM(amount), 0)::text AS "totalAmount",
        COALESCE(SUM(platform_fee), 0)::text AS "totalPlatformFee",
        COALESCE(SUM(creator_net), 0)::text AS "totalCreatorNet",
        CAST(COUNT(*) AS INTEGER) AS "salesCount"
      FROM (
        SELECT DATE(paid_at)::text AS date, amount, platform_fee, creator_net
        FROM purchases
        WHERE status = 'paid'
          AND amount > 0
          AND paid_at >= ${startDate}
          AND paid_at <= ${endDate}
          AND creator_user_id = ${userId}::uuid
        UNION ALL
        SELECT DATE(s.paid_at)::text AS date, s.amount, s.platform_fee, s.creator_net
        FROM subscriptions s
        JOIN bots b ON b.id = s.bot_id
        WHERE s.paid_at IS NOT NULL
          AND s.paid_at >= ${startDate}
          AND s.paid_at <= ${endDate}
          AND b.user_id = ${userId}::uuid
      ) t
      GROUP BY date
      ORDER BY date ASC
    `);
    return rows;
  }

  const rows = await db.$queryRaw<DailyEarningsRow[]>(Prisma.sql`
    SELECT
      date,
      COALESCE(SUM(amount), 0)::text AS "totalAmount",
      COALESCE(SUM(platform_fee), 0)::text AS "totalPlatformFee",
      COALESCE(SUM(creator_net), 0)::text AS "totalCreatorNet",
      CAST(COUNT(*) AS INTEGER) AS "salesCount"
    FROM (
      SELECT DATE(paid_at)::text AS date, amount, platform_fee, creator_net
      FROM purchases
      WHERE status = 'paid'
        AND amount > 0
        AND paid_at >= ${startDate}
        AND paid_at <= ${endDate}
      UNION ALL
      SELECT DATE(paid_at)::text AS date, amount, platform_fee, creator_net
      FROM subscriptions
      WHERE paid_at IS NOT NULL
        AND paid_at >= ${startDate}
        AND paid_at <= ${endDate}
    ) t
    GROUP BY date
    ORDER BY date ASC
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
    WITH revenue_per_user AS (
      SELECT creator_user_id AS user_id,
             amount,
             creator_net
      FROM purchases
      WHERE status = 'paid' AND amount > 0
      UNION ALL
      SELECT b.user_id AS user_id,
             s.amount,
             s.creator_net
      FROM subscriptions s
      JOIN bots b ON b.id = s.bot_id
      WHERE s.paid_at IS NOT NULL
    )
    SELECT
      u.id AS "userId",
      u.name,
      u.email,
      u.avatar_url AS "avatarUrl",
      COALESCE(SUM(r.amount), 0)::text AS "totalRevenue",
      COALESCE(SUM(r.creator_net), 0)::text AS "totalCreatorNet",
      CAST(COUNT(r.amount) AS INTEGER) AS "totalSales",
      CAST(COUNT(DISTINCT CASE WHEN b.is_active = true THEN b.id END) AS INTEGER) AS "activeBots"
    FROM users u
    LEFT JOIN bots b ON b.user_id = u.id
    LEFT JOIN revenue_per_user r ON r.user_id = u.id
    WHERE u.role = 'creator'
    GROUP BY u.id, u.name, u.email, u.avatar_url
    ORDER BY COALESCE(SUM(r.amount), 0) DESC
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
    WITH revenue_per_bot AS (
      SELECT bot_id, amount, creator_net
      FROM purchases
      WHERE status = 'paid' AND amount > 0
      UNION ALL
      SELECT bot_id, amount, creator_net
      FROM subscriptions
      WHERE paid_at IS NOT NULL
    )
    SELECT
      b.id AS "botId",
      b.name,
      b.username,
      b.is_active AS "isActive",
      u.id AS "creatorId",
      u.name AS "creatorName",
      COALESCE(SUM(r.amount), 0)::text AS "totalRevenue",
      COALESCE(SUM(r.creator_net), 0)::text AS "totalCreatorNet",
      CAST(COUNT(r.amount) AS INTEGER) AS "totalSales",
      b.total_subscribers AS "totalSubscribers"
    FROM bots b
    INNER JOIN users u ON u.id = b.user_id
    LEFT JOIN revenue_per_bot r ON r.bot_id = b.id
    GROUP BY b.id, b.name, b.username, b.is_active, b.total_subscribers, u.id, u.name
    ORDER BY COALESCE(SUM(r.amount), 0) DESC
    LIMIT ${limit}
  `);
}

// --- Conteúdos mais acessados ---

interface TopContentRow {
  contentId: string;
  title: string;
  type: string;
  price: string;
  botName: string;
  botUsername: string | null;
  creatorName: string;
  accessCount: number;
  totalRevenue: string;
}

export async function getTopContent(
  startDate: Date,
  endDate: Date,
  includeFree: boolean,
  limit: number = 50
): Promise<TopContentRow[]> {
  const freeFilter = includeFree
    ? Prisma.sql``
    : Prisma.sql`AND p.amount > 0`;

  return db.$queryRaw<TopContentRow[]>(Prisma.sql`
    SELECT
      c.id AS "contentId",
      c.title,
      c.type,
      c.price::text AS "price",
      b.name AS "botName",
      b.username AS "botUsername",
      u.name AS "creatorName",
      CAST(COUNT(p.id) AS INTEGER) AS "accessCount",
      COALESCE(SUM(p.amount), 0)::text AS "totalRevenue"
    FROM purchases p
    INNER JOIN content c ON c.id = p.content_id
    INNER JOIN bots b ON b.id = p.bot_id
    INNER JOIN users u ON u.id = p.creator_user_id
    WHERE p.status = 'paid'
      AND p."paid_at" >= ${startDate}
      AND p."paid_at" <= ${endDate}
      ${freeFilter}
    GROUP BY c.id, c.title, c.type, c.price, b.name, b.username, u.name
    ORDER BY COUNT(p.id) DESC
    LIMIT ${limit}
  `);
}
