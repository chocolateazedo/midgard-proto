import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function getUserById(userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId },
    omit: { passwordHash: true },
  });
  if (!user) return null;
  return {
    ...user,
    platformFeePercent: user.platformFeePercent.toNumber(),
  };
}

export async function getUserByEmail(email: string) {
  return db.user.findFirst({
    where: { email },
  });
}

export interface GetAllUsersFilters {
  role?: string;
  search?: string;
  isActive?: boolean;
}

export type SerializedUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "manager" | "creator";
  avatarUrl: string | null;
  isActive: boolean;
  platformFeePercent: number;
  managerFeePercent: number | null;
  managedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  activeBotCount: number;
  totalBotCount: number;
  totalGross: string;
  totalNet: string;
};

export type AllUsersResult = {
  users: SerializedUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getAllUsers(
  page: number,
  pageSize: number,
  filters?: GetAllUsersFilters
): Promise<AllUsersResult> {
  const skip = (page - 1) * pageSize;

  const where: Prisma.UserWhereInput = {};

  if (filters?.role) {
    where.role = filters.role as "owner" | "admin" | "manager" | "creator";
  }

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [userList, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        platformFeePercent: true,
        managerFeePercent: true,
        managedByUserId: true,
        createdAt: true,
        updatedAt: true,
        bots: { select: { id: true, isActive: true } },
        purchases: {
          where: { status: "paid", amount: { gt: 0 } },
          select: { amount: true, creatorNet: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.user.count({ where }),
  ]);

  // Subs pagas ficam em Subscription — relação via bot.userId.
  const subsAgg = await db.subscription.groupBy({
    by: ["botId"],
    where: {
      paidAt: { not: null },
      bot: { userId: { in: userList.map((u) => u.id) } },
    },
    _sum: { amount: true, creatorNet: true },
  });
  const grossByBot = new Map<string, number>();
  const netByBot = new Map<string, number>();
  for (const s of subsAgg) {
    grossByBot.set(s.botId, s._sum.amount?.toNumber() ?? 0);
    netByBot.set(s.botId, s._sum.creatorNet?.toNumber() ?? 0);
  }

  const usersWithStats: SerializedUser[] = userList.map((user) => {
    const totalBotCount = user.bots.length;
    const activeBotCount = user.bots.filter((b) => b.isActive).length;
    const purchasesGross = user.purchases.reduce((acc, p) => acc + p.amount.toNumber(), 0);
    const purchasesNet = user.purchases.reduce((acc, p) => acc + p.creatorNet.toNumber(), 0);
    const subsGross = user.bots.reduce((acc, b) => acc + (grossByBot.get(b.id) ?? 0), 0);
    const subsNet = user.bots.reduce((acc, b) => acc + (netByBot.get(b.id) ?? 0), 0);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      platformFeePercent: user.platformFeePercent.toNumber(),
      managerFeePercent: user.managerFeePercent?.toNumber() ?? null,
      managedByUserId: user.managedByUserId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      activeBotCount,
      totalBotCount,
      totalGross: (purchasesGross + subsGross).toFixed(2),
      totalNet: (purchasesNet + subsNet).toFixed(2),
    };
  });

  return {
    users: usersWithStats,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export type UserStats = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "manager" | "creator";
  avatarUrl: string | null;
  avatarKey: string | null;
  docType: string | null;
  docFrontKey: string | null;
  docBackKey: string | null;
  docSelfieKey: string | null;
  isActive: boolean;
  platformFeePercent: number;
  managerFeePercent: number | null;
  managedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalBots: number;
  activeBots: number;
  totalRevenue: string; // bruta
  totalCreatorNet: string; // líquida pro creator
  totalPlatformFees: string;
  totalManagerFees: string;
  totalSales: number;
};

export async function getUserStats(userId: string): Promise<UserStats | null> {
  const user = await db.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      avatarKey: true,
      docType: true,
      docFrontKey: true,
      docBackKey: true,
      docSelfieKey: true,
      isActive: true,
      platformFeePercent: true,
      createdAt: true,
      updatedAt: true,
      managerFeePercent: true,
      managedByUserId: true,
      bots: { select: { id: true, isActive: true } },
      purchases: {
        where: { status: "paid", amount: { gt: 0 } },
        select: {
          amount: true,
          creatorNet: true,
          platformFee: true,
          managerFee: true,
        },
      },
    },
  });

  if (!user) return null;

  const subs = await db.subscription.findMany({
    where: {
      paidAt: { not: null },
      bot: { userId },
    },
    select: {
      amount: true,
      creatorNet: true,
      platformFee: true,
      managerFee: true,
    },
  });

  const totalBots = user.bots.length;
  const activeBots = user.bots.filter((b) => b.isActive).length;
  const sum = (
    items: { amount?: unknown; creatorNet?: unknown; platformFee?: unknown; managerFee?: unknown }[],
    key: "amount" | "creatorNet" | "platformFee" | "managerFee"
  ): number =>
    items.reduce((acc, i) => {
      const v = i[key];
      if (v && typeof (v as { toNumber: () => number }).toNumber === "function") {
        return acc + (v as { toNumber: () => number }).toNumber();
      }
      return acc;
    }, 0);

  const totalRevenue = (sum(user.purchases, "amount") + sum(subs, "amount")).toFixed(2);
  const totalCreatorNet = (sum(user.purchases, "creatorNet") + sum(subs, "creatorNet")).toFixed(2);
  const totalPlatformFees = (sum(user.purchases, "platformFee") + sum(subs, "platformFee")).toFixed(2);
  const totalManagerFees = (sum(user.purchases, "managerFee") + sum(subs, "managerFee")).toFixed(2);
  const totalSales = user.purchases.length + subs.length;

  const { bots, purchases, ...rest } = user;

  return {
    ...rest,
    platformFeePercent: rest.platformFeePercent.toNumber(),
    managerFeePercent: rest.managerFeePercent?.toNumber() ?? null,
    totalBots,
    activeBots,
    totalRevenue,
    totalCreatorNet,
    totalPlatformFees,
    totalManagerFees,
    totalSales,
  };
}
