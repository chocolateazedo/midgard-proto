import { db } from "@/lib/db";
import { users, bots, purchases } from "@/lib/db/schema";
import { eq, and, desc, asc, like, or, count, sum, sql, ilike } from "drizzle-orm";

export async function getUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      passwordHash: false,
    },
  });
}

export async function getUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
  });
}

export interface GetAllUsersFilters {
  role?: string;
  search?: string;
  isActive?: boolean;
}

export async function getAllUsers(
  page: number,
  pageSize: number,
  filters?: GetAllUsersFilters
) {
  const offset = (page - 1) * pageSize;

  const conditions = [];

  if (filters?.role) {
    conditions.push(eq(users.role, filters.role as "owner" | "admin" | "creator"));
  }

  if (filters?.isActive !== undefined) {
    conditions.push(eq(users.isActive, filters.isActive));
  }

  if (filters?.search) {
    const searchTerm = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(users.name, searchTerm),
        ilike(users.email, searchTerm)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [userList, totalResult] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
        platformFeePercent: users.platformFeePercent,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        activeBotCount: sql<number>`CAST(COUNT(DISTINCT CASE WHEN ${bots.isActive} = true THEN ${bots.id} END) AS INTEGER)`,
        totalBotCount: sql<number>`CAST(COUNT(DISTINCT ${bots.id}) AS INTEGER)`,
        totalRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.creatorNet} ELSE 0 END), 0)`,
      })
      .from(users)
      .leftJoin(bots, eq(bots.userId, users.id))
      .leftJoin(purchases, eq(purchases.creatorUserId, users.id))
      .where(whereClause)
      .groupBy(
        users.id,
        users.email,
        users.name,
        users.role,
        users.avatarUrl,
        users.isActive,
        users.platformFeePercent,
        users.createdAt,
        users.updatedAt
      )
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset),

    db
      .select({ total: count() })
      .from(users)
      .where(whereClause),
  ]);

  return {
    users: userList,
    total: totalResult[0]?.total ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((totalResult[0]?.total ?? 0) / pageSize),
  };
}

export async function getUserStats(userId: string) {
  const [userResult] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      avatarUrl: users.avatarUrl,
      isActive: users.isActive,
      platformFeePercent: users.platformFeePercent,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      totalBots: sql<number>`CAST(COUNT(DISTINCT ${bots.id}) AS INTEGER)`,
      activeBots: sql<number>`CAST(COUNT(DISTINCT CASE WHEN ${bots.isActive} = true THEN ${bots.id} END) AS INTEGER)`,
      totalRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.amount} ELSE 0 END), '0')`,
      totalCreatorNet: sql<string>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.creatorNet} ELSE 0 END), '0')`,
      totalPlatformFees: sql<string>`COALESCE(SUM(CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.platformFee} ELSE 0 END), '0')`,
      totalSales: sql<number>`CAST(COUNT(DISTINCT CASE WHEN ${purchases.status} = 'paid' THEN ${purchases.id} END) AS INTEGER)`,
    })
    .from(users)
    .leftJoin(bots, eq(bots.userId, users.id))
    .leftJoin(purchases, eq(purchases.creatorUserId, users.id))
    .where(eq(users.id, userId))
    .groupBy(
      users.id,
      users.email,
      users.name,
      users.role,
      users.avatarUrl,
      users.isActive,
      users.platformFeePercent,
      users.createdAt,
      users.updatedAt
    );

  return userResult ?? null;
}
