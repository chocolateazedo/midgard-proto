"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard } from "@/components/shared/metric-card";
import { retryWithdrawal } from "@/server/actions/financial.actions";
import type {
  AdminWithdrawLogRow,
  WithdrawalsSummary,
} from "@/server/queries/withdrawals";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FILTER_LABEL: Record<string, string> = {
  all: "Todos",
  pending: "Pendentes",
  succeeded: "Concluídos",
  failed: "Falhou",
};

interface Props {
  rows: AdminWithdrawLogRow[];
  summary: WithdrawalsSummary;
  currentFilter: "all" | "pending" | "succeeded" | "failed";
}

export function FinanceiroAdminClient({ rows, summary, currentFilter }: Props) {
  const router = useRouter();
  const [retryingId, setRetryingId] = React.useState<string | null>(null);

  async function handleRetry(logId: string) {
    setRetryingId(logId);
    try {
      const result = await retryWithdrawal(logId);
      if (result.success && result.data) {
        toast.success(
          `Novo saque de ${formatBRL(result.data.amountCents)} solicitado`
        );
        router.refresh();
      } else {
        toast.error(result.error ?? "Erro ao reprocessar");
      }
    } finally {
      setRetryingId(null);
    }
  }

  function setFilter(f: string) {
    const url = f === "all" ? "/admin/financeiro" : `/admin/financeiro?status=${f}`;
    router.push(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Financeiro — Saques</h1>
        <p className="text-sm text-slate-500 mt-1">
          Todos os saques solicitados por creators e gestores via Split Pix
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Pendentes"
          value={`${summary.pendingCount}`}
          icon={Clock}
          description={formatBRL(summary.pendingTotalCents)}
          iconClassName="bg-amber-100 text-amber-600"
        />
        <MetricCard
          title="Concluídos no mês"
          value={`${summary.succeededMonthCount}`}
          icon={CheckCircle2}
          description={formatBRL(summary.succeededMonthTotalCents)}
          iconClassName="bg-emerald-100 text-emerald-600"
        />
        <MetricCard
          title="Falharam"
          value={`${summary.failedCount}`}
          icon={AlertTriangle}
          description="Total histórico"
          iconClassName="bg-red-100 text-red-600"
        />
      </div>

      <Card className="bg-white border-slate-200/60">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-3">
          <div>
            <CardTitle className="text-slate-900 text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" />
              Operações
            </CardTitle>
            <CardDescription className="text-slate-400">
              Últimos {rows.length} saques {currentFilter !== "all" ? `(${FILTER_LABEL[currentFilter]})` : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "pending", "succeeded", "failed"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={currentFilter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
                className={
                  currentFilter === f
                    ? "bg-primary-600 hover:bg-primary-700 text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }
              >
                {FILTER_LABEL[f]}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">
              Nenhum saque encontrado com o filtro atual.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitado em</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Chave Pix</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Concluído em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                      {formatDateTime(r.requestedAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/users/${r.userId}`}
                        className="text-primary-700 hover:underline text-sm flex items-center gap-1"
                      >
                        {r.userName}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      <p className="text-xs text-slate-400">{r.userEmail}</p>
                      <p className="text-[10px] text-slate-400 uppercase mt-0.5">
                        {r.userRole}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 break-all max-w-[200px]">
                      {r.pixKey}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-slate-800 whitespace-nowrap">
                      {formatBRL(r.amountCents)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                      {r.errorMessage && (
                        <p className="text-xs text-red-600 mt-1 max-w-[240px] break-all">
                          {r.errorCode ? `[${r.errorCode}] ` : ""}
                          {r.errorMessage}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                      {formatDateTime(r.completedAt)}
                    </TableCell>
                    <TableCell>
                      {r.status === "failed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryingId === r.id}
                          onClick={() => handleRetry(r.id)}
                          className="h-7 border-slate-200 text-slate-700 hover:bg-slate-50"
                        >
                          {retryingId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Tentar novamente
                            </>
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "succeeded" | "failed";
}) {
  if (status === "succeeded") {
    return (
      <Badge className="text-xs gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
        <CheckCircle2 className="h-3 w-3" />
        Concluído
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="text-xs gap-1 bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
        <AlertTriangle className="h-3 w-3" />
        Falhou
      </Badge>
    );
  }
  return (
    <Badge className="text-xs gap-1 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
      <Clock className="h-3 w-3" />
      Pendente
    </Badge>
  );
}
