"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getFinancialSummary,
  requestWithdrawAll,
  type FinancialSummary,
  type FinancialEntry,
  type FinancialWithdrawal,
} from "@/server/actions/financial.actions";

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

export function FinancialClient() {
  const [summary, setSummary] = React.useState<FinancialSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [withdrawing, setWithdrawing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await getFinancialSummary();
    if (result.success && result.data) {
      setSummary(result.data);
    } else {
      toast.error(result.error ?? "Erro ao carregar resumo financeiro");
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleWithdraw() {
    setWithdrawing(true);
    try {
      const result = await requestWithdrawAll();
      if (result.success && result.data) {
        toast.success(
          `Saque de ${formatBRL(result.data.amountCents)} solicitado. Aguarde a confirmação da Woovi.`
        );
        await load();
      } else {
        toast.error(result.error ?? "Erro ao solicitar saque");
      }
    } finally {
      setWithdrawing(false);
    }
  }

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    );
  }
  if (!summary) return null;

  const balance = summary.balanceCents ?? summary.balanceDerivedCents;
  const canWithdraw =
    summary.subAccountStatus === "active" &&
    summary.hasPixKey &&
    summary.balanceCents !== null &&
    summary.balanceCents > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financeiro</h1>
          <p className="text-sm text-slate-500">
            Saldo, entradas, saques e solicitação de transferência para sua chave Pix
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="h-9 border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Card de saldo */}
      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-slate-900 text-base">Saldo disponível</CardTitle>
          </div>
          <CardDescription className="text-slate-400">
            Valor acumulado na sua subconta Woovi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-4xl font-bold text-slate-900">
                {formatBRL(balance)}
              </p>
              {summary.balanceCents === null && summary.balanceError && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Saldo estimado (não consegui consultar a Woovi agora)
                </p>
              )}
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={!canWithdraw || withdrawing}
                  className="bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
                >
                  {withdrawing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Solicitando...
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      Solicitar saque
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar solicitação de saque</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-sm text-slate-600">
                      <p>
                        O saque é sempre do <strong>saldo total</strong> da sua
                        subconta. Após confirmar, o valor de{" "}
                        <strong>{formatBRL(balance)}</strong> será transferido
                        para a chave Pix cadastrada e o saldo será zerado neste
                        momento.
                      </p>
                      <p>
                        A Woovi leva alguns instantes para processar a
                        transferência. Você verá o saque em Saídas como{" "}
                        <em>Pendente</em> até que a confirmação chegue.
                      </p>
                      <p>
                        Enquanto houver saldo, não é possível alterar a chave
                        Pix ou o tipo da chave — faça o saque primeiro e depois
                        atualize os dados em Minha conta.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleWithdraw}
                    className="bg-primary-600 hover:bg-primary-700 text-white"
                  >
                    Confirmar saque total
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {!summary.hasPixKey && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Cadastre sua chave Pix em <strong>Minha conta</strong> para
              começar a receber.
            </div>
          )}
          {summary.hasPixKey && summary.subAccountStatus === "pending" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Sua subconta Woovi está sendo provisionada. Aguarde alguns
              instantes e recarregue a página.
            </div>
          )}
          {summary.hasPixKey && summary.subAccountStatus === "failed" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              Sua subconta Woovi não foi provisionada. Verifique a chave Pix em
              Minha conta e salve novamente.
            </div>
          )}
          {summary.subAccountStatus === "active" &&
            summary.balanceCents === 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Sem saldo para sacar no momento. Vendas com Split Pix somam
                saldo conforme seus clientes pagam.
              </div>
            )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">
            Operações financeiras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="entradas">
            <TabsList className="bg-slate-100 border border-slate-200">
              <TabsTrigger
                value="entradas"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-slate-500"
              >
                Entradas ({summary.entries.length})
              </TabsTrigger>
              <TabsTrigger
                value="saidas"
                className="data-[state=active]:bg-primary-600 data-[state=active]:text-white text-slate-500"
              >
                Saídas ({summary.withdrawals.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="entradas" className="pt-4">
              <EntryList entries={summary.entries} />
            </TabsContent>
            <TabsContent value="saidas" className="pt-4">
              <WithdrawalList items={summary.withdrawals} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function EntryList({ entries }: { entries: FinancialEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-8">
        Nenhuma entrada ainda. Vendas com Split Pix aparecem aqui conforme são pagas.
      </p>
    );
  }
  return (
    <div className="divide-y divide-slate-100">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between py-3 gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <ArrowDownRight className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {e.description}
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{formatDateTime(e.occurredAt)}</span>
                <Badge
                  variant="outline"
                  className="border-slate-200 text-slate-500 font-normal h-5 px-1.5"
                >
                  {e.role === "creator" ? "Creator" : "Gestor"}
                </Badge>
              </div>
            </div>
          </div>
          <p className="text-sm font-semibold text-emerald-700 shrink-0">
            +{formatBRL(e.amountCents)}
          </p>
        </div>
      ))}
    </div>
  );
}

function WithdrawalList({ items }: { items: FinancialWithdrawal[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-8">
        Nenhum saque solicitado ainda.
      </p>
    );
  }
  return (
    <div className="divide-y divide-slate-100">
      {items.map((w) => (
        <div
          key={w.id}
          className="flex items-center justify-between py-3 gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center shrink-0">
              <ArrowUpRight className="h-4 w-4 text-primary-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">
                Saque para sua chave Pix
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{formatDateTime(w.requestedAt)}</span>
                <WithdrawStatusBadge status={w.status} />
              </div>
              {w.status === "failed" && w.errorMessage && (
                <p className="text-xs text-red-600 mt-1 break-all">
                  {w.errorMessage}
                </p>
              )}
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-700 shrink-0">
            −{formatBRL(w.amountCents)}
          </p>
        </div>
      ))}
    </div>
  );
}

function WithdrawStatusBadge({
  status,
}: {
  status: "pending" | "succeeded" | "failed";
}) {
  if (status === "succeeded") {
    return (
      <Badge className="text-xs gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 h-5 px-1.5">
        <CheckCircle2 className="h-3 w-3" />
        Concluído
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="text-xs gap-1 bg-red-100 text-red-700 border-red-200 hover:bg-red-100 h-5 px-1.5">
        <AlertTriangle className="h-3 w-3" />
        Falhou
      </Badge>
    );
  }
  return (
    <Badge className="text-xs gap-1 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 h-5 px-1.5">
      <Clock className="h-3 w-3" />
      Pendente
    </Badge>
  );
}
