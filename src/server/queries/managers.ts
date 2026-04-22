import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type ManagedCreator = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
  managerFeePercent: number | null;
  createdAt: Date;
  activeBotCount: number;
  totalBotCount: number;
  totalGross: string;
  platformFees: string;
  managerEarnings: string;
  creatorNet: string;
};

/**
 * Lista todos os creators sob um manager, com agregação de receita.
 */
export async function getManagerCreators(managerId: string): Promise<ManagedCreator[]> {
  const creators = await db.user.findMany({
    where: { managedByUserId: managerId, role: "creator" },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      isActive: true,
      managerFeePercent: true,
      createdAt: true,
      bots: { select: { id: true, isActive: true } },
      purchases: {
        where: { status: "paid", amount: { gt: 0 } },
        select: {
          amount: true,
          platformFee: true,
          managerFee: true,
          creatorNet: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const subsAgg = await db.subscription.groupBy({
    by: ["botId"],
    where: {
      paidAt: { not: null },
      bot: { userId: { in: creators.map((c) => c.id) } },
    },
    _sum: {
      amount: true,
      platformFee: true,
      managerFee: true,
      creatorNet: true,
    },
  });
  const grossByBot = new Map<string, number>();
  const platformByBot = new Map<string, number>();
  const managerFeeByBot = new Map<string, number>();
  const netByBot = new Map<string, number>();
  for (const s of subsAgg) {
    grossByBot.set(s.botId, s._sum.amount?.toNumber() ?? 0);
    platformByBot.set(s.botId, s._sum.platformFee?.toNumber() ?? 0);
    managerFeeByBot.set(s.botId, s._sum.managerFee?.toNumber() ?? 0);
    netByBot.set(s.botId, s._sum.creatorNet?.toNumber() ?? 0);
  }

  return creators.map((c) => {
    const pGross = c.purchases.reduce((acc, p) => acc + p.amount.toNumber(), 0);
    const pPlatform = c.purchases.reduce((acc, p) => acc + p.platformFee.toNumber(), 0);
    const pMgr = c.purchases.reduce((acc, p) => acc + p.managerFee.toNumber(), 0);
    const pNet = c.purchases.reduce((acc, p) => acc + p.creatorNet.toNumber(), 0);
    const sGross = c.bots.reduce((acc, b) => acc + (grossByBot.get(b.id) ?? 0), 0);
    const sPlatform = c.bots.reduce((acc, b) => acc + (platformByBot.get(b.id) ?? 0), 0);
    const sMgr = c.bots.reduce((acc, b) => acc + (managerFeeByBot.get(b.id) ?? 0), 0);
    const sNet = c.bots.reduce((acc, b) => acc + (netByBot.get(b.id) ?? 0), 0);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      avatarUrl: c.avatarUrl,
      isActive: c.isActive,
      managerFeePercent: c.managerFeePercent?.toNumber() ?? null,
      createdAt: c.createdAt,
      activeBotCount: c.bots.filter((b) => b.isActive).length,
      totalBotCount: c.bots.length,
      totalGross: (pGross + sGross).toFixed(2),
      platformFees: (pPlatform + sPlatform).toFixed(2),
      managerEarnings: (pMgr + sMgr).toFixed(2),
      creatorNet: (pNet + sNet).toFixed(2),
    };
  });
}

/**
 * Lista bots dos creators de um manager.
 */
export async function getManagerBots(managerId: string) {
  const bots = await db.bot.findMany({
    where: { user: { managedByUserId: managerId } },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return bots.map((b) => ({
    ...b,
    totalRevenue: b.totalRevenue.toNumber(),
  }));
}

/**
 * IDs dos bots que pertencem aos creators de um manager — usado pra filtrar
 * membros, assinantes, etc.
 */
export async function getManagerBotIds(managerId: string): Promise<string[]> {
  const bots = await db.bot.findMany({
    where: { user: { managedByUserId: managerId } },
    select: { id: true },
  });
  return bots.map((b) => b.id);
}

export type ManagerMember = {
  id: string;
  telegramUserId: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  totalSpent: number;
  activePlanName: string | null;
  bots: { id: string; name: string; username: string | null }[];
};

export async function getManagerMembers(
  managerId: string,
  page: number,
  pageSize: number,
  opts?: { search?: string; withActiveSubscription?: boolean }
): Promise<{ members: ManagerMember[]; total: number; totalPages: number }> {
  const botIds = await getManagerBotIds(managerId);
  if (botIds.length === 0) {
    return { members: [], total: 0, totalPages: 0 };
  }

  const where: Prisma.BotUserWhereInput = { botId: { in: botIds } };
  if (opts?.search) {
    where.OR = [
      { telegramUsername: { contains: opts.search, mode: "insensitive" } },
      { telegramFirstName: { contains: opts.search, mode: "insensitive" } },
    ];
  }
  if (opts?.withActiveSubscription) {
    where.subscriptions = {
      some: { status: "active", endDate: { gt: new Date() } },
    };
  }

  const total = await db.botUser.count({ where });
  const botUsers = await db.botUser.findMany({
    where,
    include: {
      bot: { select: { id: true, name: true, username: true } },
      purchases: {
        where: { status: "paid", amount: { gt: 0 } },
        select: { amount: true },
      },
      subscriptions: {
        where: { paidAt: { not: null } },
        select: {
          amount: true,
          status: true,
          endDate: true,
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { lastSeenAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  // Agrupa pelo telegramUserId pra unificar interações entre bots do mesmo manager.
  const userMap = new Map<string, ManagerMember>();
  const now = new Date();
  for (const bu of botUsers) {
    const key = bu.telegramUserId.toString();
    const spent =
      bu.purchases.reduce((a, p) => a + p.amount.toNumber(), 0) +
      bu.subscriptions.reduce((a, s) => a + s.amount.toNumber(), 0);
    const active = bu.subscriptions.find(
      (s) => s.status === "active" && s.endDate && s.endDate > now
    );
    const existing = userMap.get(key);
    if (existing) {
      existing.bots.push(bu.bot);
      existing.totalSpent += spent;
      if (active && !existing.activePlanName) {
        existing.activePlanName = active.plan.name;
      }
      if (bu.lastSeenAt > new Date(existing.lastSeenAt)) {
        existing.lastSeenAt = bu.lastSeenAt.toISOString();
      }
    } else {
      userMap.set(key, {
        id: bu.id,
        telegramUserId: Number(bu.telegramUserId),
        telegramUsername: bu.telegramUsername,
        telegramFirstName: bu.telegramFirstName,
        firstSeenAt: bu.firstSeenAt.toISOString(),
        lastSeenAt: bu.lastSeenAt.toISOString(),
        totalSpent: spent,
        activePlanName: active?.plan.name ?? null,
        bots: [bu.bot],
      });
    }
  }

  const members = Array.from(userMap.values());
  return {
    members,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export type ManagerStats = {
  totalCreators: number;
  activeCreators: number;
  totalBots: number;
  activeBots: number;
  totalMembers: number;
  activeSubscribers: number;
  // Bruto gerado pelos creators (30d)
  creatorsGross: string;
  platformFees: string;
  managerEarnings: string;
  creatorsNet: string;
  lifetimeGross: string;
  lifetimePlatformFees: string;
  lifetimeManagerEarnings: string;
  lifetimeCreatorsNet: string;
};

export async function getManagerStats(managerId: string): Promise<ManagerStats> {
  const now = new Date();
  const thirty = new Date(now);
  thirty.setDate(thirty.getDate() - 30);

  const creators = await db.user.findMany({
    where: { managedByUserId: managerId, role: "creator" },
    select: { id: true, isActive: true, bots: { select: { id: true, isActive: true } } },
  });
  const creatorIds = creators.map((c) => c.id);
  const botIds = creators.flatMap((c) => c.bots.map((b) => b.id));

  const totalMembers = await db.botUser.count({
    where: { botId: { in: botIds } },
  });

  const activeSubRows = await db.subscription.findMany({
    where: {
      status: "active",
      endDate: { gt: now },
      bot: { userId: { in: creatorIds } },
    },
    select: { botUserId: true },
    distinct: ["botUserId"],
  });

  const [p30, s30, pAll, sAll] = await Promise.all([
    db.purchase.aggregate({
      where: {
        status: "paid",
        amount: { gt: 0 },
        paidAt: { gte: thirty, lte: now },
        creatorUserId: { in: creatorIds },
      },
      _sum: {
        amount: true,
        platformFee: true,
        managerFee: true,
        creatorNet: true,
      },
    }),
    db.subscription.aggregate({
      where: {
        paidAt: { gte: thirty, lte: now },
        bot: { userId: { in: creatorIds } },
      },
      _sum: {
        amount: true,
        platformFee: true,
        managerFee: true,
        creatorNet: true,
      },
    }),
    db.purchase.aggregate({
      where: {
        status: "paid",
        amount: { gt: 0 },
        creatorUserId: { in: creatorIds },
      },
      _sum: {
        amount: true,
        platformFee: true,
        managerFee: true,
        creatorNet: true,
      },
    }),
    db.subscription.aggregate({
      where: { paidAt: { not: null }, bot: { userId: { in: creatorIds } } },
      _sum: {
        amount: true,
        platformFee: true,
        managerFee: true,
        creatorNet: true,
      },
    }),
  ]);

  const num = (v: Prisma.Decimal | null) => (v ? v.toNumber() : 0);

  return {
    totalCreators: creators.length,
    activeCreators: creators.filter((c) => c.isActive).length,
    totalBots: botIds.length,
    activeBots: creators.flatMap((c) => c.bots).filter((b) => b.isActive).length,
    totalMembers,
    activeSubscribers: activeSubRows.length,
    creatorsGross: (num(p30._sum.amount) + num(s30._sum.amount)).toFixed(2),
    platformFees: (num(p30._sum.platformFee) + num(s30._sum.platformFee)).toFixed(2),
    managerEarnings: (num(p30._sum.managerFee) + num(s30._sum.managerFee)).toFixed(2),
    creatorsNet: (num(p30._sum.creatorNet) + num(s30._sum.creatorNet)).toFixed(2),
    lifetimeGross: (num(pAll._sum.amount) + num(sAll._sum.amount)).toFixed(2),
    lifetimePlatformFees: (
      num(pAll._sum.platformFee) + num(sAll._sum.platformFee)
    ).toFixed(2),
    lifetimeManagerEarnings: (
      num(pAll._sum.managerFee) + num(sAll._sum.managerFee)
    ).toFixed(2),
    lifetimeCreatorsNet: (
      num(pAll._sum.creatorNet) + num(sAll._sum.creatorNet)
    ).toFixed(2),
  };
}

/**
 * Verifica que um bot pertence a um creator gerenciado pelo manager.
 * Usado em permission checks.
 */
export async function ensureManagerOwnsBot(
  managerId: string,
  botId: string
): Promise<boolean> {
  const bot = await db.bot.findFirst({
    where: { id: botId, user: { managedByUserId: managerId } },
    select: { id: true },
  });
  return !!bot;
}

/**
 * Verifica que um creator é gerenciado pelo manager.
 */
export async function ensureManagerOwnsCreator(
  managerId: string,
  creatorId: string
): Promise<boolean> {
  const creator = await db.user.findFirst({
    where: { id: creatorId, managedByUserId: managerId },
    select: { id: true },
  });
  return !!creator;
}
