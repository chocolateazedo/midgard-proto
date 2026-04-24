import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getAllWithdrawLogs,
  getWithdrawalsSummary,
} from "@/server/queries/withdrawals";
import { FinanceiroAdminClient } from "./financeiro-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminFinanceiroPage({ searchParams }: PageProps) {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "owner" && session.user.role !== "admin")
  ) {
    redirect("/login");
  }

  const params = await searchParams;
  const statusFilter =
    params.status === "pending" ||
    params.status === "succeeded" ||
    params.status === "failed"
      ? params.status
      : undefined;

  const [rows, summary] = await Promise.all([
    getAllWithdrawLogs({ status: statusFilter }, 300),
    getWithdrawalsSummary(),
  ]);

  return (
    <FinanceiroAdminClient
      rows={rows}
      summary={summary}
      currentFilter={statusFilter ?? "all"}
    />
  );
}
