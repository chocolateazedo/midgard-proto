import { redirect } from "next/navigation";
import { DollarSign, TrendingUp, Landmark } from "lucide-react";

import { auth } from "@/lib/auth";
import { getCreatorEarnings, getDailyEarnings } from "@/server/queries/earnings";
import { MetricCard } from "@/components/shared/metric-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EarningsBarChart } from "./earnings-bar-chart";
import { EarningsPeriodSelector } from "./earnings-period-selector";
import { ExportCsvButton } from "./export-csv-button";

interface EarningsPageProps {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

function getPeriodDates(
  period: string | undefined,
  from: string | undefined,
  to: string | undefined
): { startDate: Date; endDate: Date; label: string } {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  if (from && to) {
    return {
      startDate: new Date(from),
      endDate: new Date(to + "T23:59:59"),
      label: `${from} até ${to}`,
    };
  }

  switch (period) {
    case "7d": {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: now, label: "Últimos 7 dias" };
    }
    case "90d": {
      const start = new Date(now);
      start.setDate(now.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: now, label: "Últimos 90 dias" };
    }
    default: {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: now, label: "Últimos 30 dias" };
    }
  }
}

function getStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid":
      return "default";
    case "pending":
      return "secondary";
    case "expired":
      return "destructive";
    case "refunded":
      return "outline";
    default:
      return "secondary";
  }
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    paid: "Pago",
    pending: "Pendente",
    expired: "Expirado",
    refunded: "Reembolsado",
  };
  return labels[status] ?? status;
}

export default async function EarningsPage({ searchParams }: EarningsPageProps) {
  const { period, from, to } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { startDate, endDate, label } = getPeriodDates(period, from, to);

  const [sales, dailyData] = await Promise.all([
    getCreatorEarnings(session.user.id, startDate, endDate),
    getDailyEarnings(session.user.id, startDate, endDate),
  ]);

  const totalBruto = sales.reduce((acc, s) => acc + parseFloat(s.amount), 0);
  const totalTaxa = sales.reduce((acc, s) => acc + parseFloat(s.platformFee), 0);
  const totalLiquido = sales.reduce((acc, s) => acc + parseFloat(s.creatorNet), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Ganhos</h1>
          <p className="text-sm text-zinc-500">{label}</p>
        </div>
        <EarningsPeriodSelector currentPeriod={period ?? "30d"} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="Total Bruto"
          value={formatCurrency(totalBruto)}
          icon={DollarSign}
          iconClassName="bg-zinc-500/20 text-zinc-400"
          description="Valor total recebido"
        />
        <MetricCard
          title="Taxa da Plataforma"
          value={formatCurrency(totalTaxa)}
          icon={Landmark}
          iconClassName="bg-red-500/20 text-red-400"
          description="Deduzida automaticamente"
        />
        <MetricCard
          title="Receita Líquida"
          value={formatCurrency(totalLiquido)}
          icon={TrendingUp}
          iconClassName="bg-emerald-500/20 text-emerald-400"
          description="O que você recebe"
        />
      </div>

      {/* Bar Chart */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="text-base text-zinc-100">
            Receita por Dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EarningsBarChart data={dailyData} />
        </CardContent>
      </Card>

      {/* Sales Table */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-zinc-100">
            Todas as Vendas ({sales.length})
          </CardTitle>
          <ExportCsvButton sales={sales} />
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <DollarSign className="h-12 w-12 text-zinc-700 mb-3" />
              <p className="text-zinc-400 font-medium">
                Nenhuma venda no período
              </p>
              <p className="text-zinc-600 text-sm mt-1">
                Tente selecionar um período diferente
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="pb-3 text-left text-xs font-medium text-zinc-500">
                      Data
                    </th>
                    <th className="pb-3 text-left text-xs font-medium text-zinc-500">
                      Conteúdo
                    </th>
                    <th className="pb-3 text-left text-xs font-medium text-zinc-500">
                      Bot
                    </th>
                    <th className="pb-3 text-right text-xs font-medium text-zinc-500">
                      Bruto
                    </th>
                    <th className="pb-3 text-right text-xs font-medium text-zinc-500">
                      Taxa
                    </th>
                    <th className="pb-3 text-right text-xs font-medium text-zinc-500">
                      Líquido
                    </th>
                    <th className="pb-3 text-right text-xs font-medium text-zinc-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {sales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="py-3 text-zinc-500 text-xs">
                        {sale.paidAt ? formatDate(sale.paidAt) : "—"}
                      </td>
                      <td className="py-3 text-zinc-300 max-w-[180px] truncate pr-4">
                        {sale.content?.title ?? "—"}
                      </td>
                      <td className="py-3 text-zinc-400 text-xs">
                        {sale.bot?.name ?? "—"}
                      </td>
                      <td className="py-3 text-right text-zinc-300">
                        {formatCurrency(parseFloat(sale.amount))}
                      </td>
                      <td className="py-3 text-right text-red-400 text-xs">
                        -{formatCurrency(parseFloat(sale.platformFee))}
                      </td>
                      <td className="py-3 text-right font-medium text-emerald-400">
                        {formatCurrency(parseFloat(sale.creatorNet))}
                      </td>
                      <td className="py-3 text-right">
                        <Badge
                          variant={getStatusVariant(sale.status ?? "")}
                          className="text-xs"
                        >
                          {getStatusLabel(sale.status ?? "")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
