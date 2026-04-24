import { db } from "@/lib/db";

export interface AdminWithdrawLogRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: "owner" | "admin" | "manager" | "creator";
  pixKey: string;
  amountCents: number;
  status: "pending" | "succeeded" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
  correlationId: string;
  requestedAt: Date;
  completedAt: Date | null;
}

export interface WithdrawalsSummary {
  pendingCount: number;
  pendingTotalCents: number;
  succeededMonthCount: number;
  succeededMonthTotalCents: number;
  failedCount: number;
}

export async function getAllWithdrawLogs(
  filter: { status?: "pending" | "succeeded" | "failed" } = {},
  limit = 200
): Promise<AdminWithdrawLogRow[]> {
  const rows = await db.withdrawLog.findMany({
    where: filter.status ? { status: filter.status } : undefined,
    orderBy: { requestedAt: "desc" },
    take: limit,
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    userEmail: r.user.email,
    userRole: r.user.role,
    pixKey: r.pixKey,
    amountCents: r.amountCents,
    status: r.status,
    errorCode: r.errorCode,
    errorMessage: r.errorMessage,
    correlationId: r.correlationId,
    requestedAt: r.requestedAt,
    completedAt: r.completedAt,
  }));
}

export async function getWithdrawalsSummary(): Promise<WithdrawalsSummary> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [pending, succeededMonth, failed] = await Promise.all([
    db.withdrawLog.aggregate({
      where: { status: "pending" },
      _count: true,
      _sum: { amountCents: true },
    }),
    db.withdrawLog.aggregate({
      where: {
        status: "succeeded",
        completedAt: { gte: startOfMonth },
      },
      _count: true,
      _sum: { amountCents: true },
    }),
    db.withdrawLog.aggregate({
      where: { status: "failed" },
      _count: true,
    }),
  ]);

  return {
    pendingCount: pending._count ?? 0,
    pendingTotalCents: pending._sum.amountCents ?? 0,
    succeededMonthCount: succeededMonth._count ?? 0,
    succeededMonthTotalCents: succeededMonth._sum.amountCents ?? 0,
    failedCount: failed._count ?? 0,
  };
}
