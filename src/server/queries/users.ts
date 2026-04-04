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
  role: "owner" | "admin" | "creator";
  avatarUrl: string | null;
  isActive: boolean;
  platformFeePercent: number;
  createdAt: Date;
  updatedAt: Date;
  activeBotCount: number;
  totalBotCount: number;
  totalRevenue: string;
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
    where.role = filters.role as "owner" | "admin" | "creator";
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
        createdAt: true,
        updatedAt: true,
        bots: {
          select: {
            id: true,
            isActive: true,
          },
        },
        purchases: {
          where: { status: "paid", amount: { gt: 0 } },
          select: { creatorNet: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),

    db.user.count({ where }),
  ]);

  const usersWithStats = userList.map((user) => {
    const totalBotCount = user.bots.length;
    const activeBotCount = user.bots.filter((b) => b.isActive).length;
    const totalRevenue = user.purchases
      .reduce((acc, p) => acc + p.creatorNet.toNumber(), 0)
      .toFixed(2);

    const { bots, purchases, ...rest } = user;
    return {
      ...rest,
      platformFeePercent: rest.platformFeePercent.toNumber(),
      activeBotCount,
      totalBotCount,
      totalRevenue,
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
  role: "owner" | "admin" | "creator";
  avatarUrl: string | null;
  isActive: boolean;
  platformFeePercent: number;
  createdAt: Date;
  updatedAt: Date;
  totalBots: number;
  activeBots: number;
  totalRevenue: string;
  totalCreatorNet: string;
  totalPlatformFees: string;
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
      isActive: true,
      platformFeePercent: true,
      createdAt: true,
      updatedAt: true,
      bots: {
        select: {
          id: true,
          isActive: true,
        },
      },
      purchases: {
        where: { status: "paid", amount: { gt: 0 } },
        select: {
          amount: true,
          creatorNet: true,
          platformFee: true,
        },
      },
    },
  });

  if (!user) return null;

  const totalBots = user.bots.length;
  const activeBots = user.bots.filter((b) => b.isActive).length;
  const totalRevenue = user.purchases
    .reduce((acc, p) => acc + p.amount.toNumber(), 0)
    .toFixed(2);
  const totalCreatorNet = user.purchases
    .reduce((acc, p) => acc + p.creatorNet.toNumber(), 0)
    .toFixed(2);
  const totalPlatformFees = user.purchases
    .reduce((acc, p) => acc + p.platformFee.toNumber(), 0)
    .toFixed(2);
  const totalSales = user.purchases.length;

  const { bots, purchases, ...rest } = user;

  return {
    ...rest,
    platformFeePercent: rest.platformFeePercent.toNumber(),
    totalBots,
    activeBots,
    totalRevenue,
    totalCreatorNet,
    totalPlatformFees,
    totalSales,
  };
}
