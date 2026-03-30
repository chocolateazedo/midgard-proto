import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  DollarSign,
  Bot,
  Users,
  ShoppingCart,
  Plus,
  TrendingUp,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { getUserStats } from "@/server/queries/users";
import { getDailyEarnings, getCreatorEarnings } from "@/server/queries/earnings";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { RevenueChart } from "./revenue-chart";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const now = new Date();
  const startOf30Days = new Date(now);
  startOf30Days.setDate(now.getDate() - 30);
  startOf30Days.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const stats = await getUserStats(session.user.id)
  const dailyData = await getDailyEarnings(session.user.id, startOf30Days, now)
  const recentSales = await getCreatorEarnings(session.user.id, startOf30Days, now)
  const todaySales = await getCreatorEarnings(session.user.id, startOfDay, now)

  const monthlyEarnings = await getCreatorEarnings(
    session.user.id,
    startOfMonth,
    now
  );

  const totalMonth = monthlyEarnings.reduce(
    (acc, p) => acc + p.creatorNet,
    0
  );
  const totalLifetime = parseFloat(stats?.totalCreatorNet ?? "0");
  const activeBots = stats?.activeBots ?? 0;
  const totalSubscribers = 0; // computed from bots aggregate
  const salesToday = todaySales.length;

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

  const last10Sales = recentSales.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            Olá, {session.user.name.split(" ")[0]}!
          </h1>
          <p className="text-sm text-zinc-500">
            Aqui está um resumo da sua atividade
          </p>
        </div>
        <Button asChild className="bg-violet-600 hover:bg-violet-700 text-white">
          <Link href="/dashboard/bots/new">
            <Plus className="mr-2 h-4 w-4" />
            Novo Bot
          </Link>
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          title="Ganhos do Mês"
          value={formatCurrency(totalMonth)}
          icon={DollarSign}
          iconClassName="bg-emerald-500/20 text-emerald-400"
        />
        <MetricCard
          title="Ganhos Totais"
          value={formatCurrency(totalLifetime)}
          icon={TrendingUp}
          iconClassName="bg-violet-500/20 text-violet-400"
        />
        <MetricCard
          title="Bots Ativos"
          value={String(activeBots)}
          icon={Bot}
          iconClassName="bg-blue-500/20 text-blue-400"
        />
        <MetricCard
          title="Assinantes"
          value={String(totalSubscribers)}
          icon={Users}
          iconClassName="bg-amber-500/20 text-amber-400"
        />
        <MetricCard
          title="Vendas Hoje"
          value={String(salesToday)}
          icon={ShoppingCart}
          iconClassName="bg-pink-500/20 text-pink-400"
        />
      </div>

      {/* Revenue Chart */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="text-zinc-100 text-base">
            Receita — Últimos 30 Dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={<Skeleton className="h-64 w-full bg-zinc-800" />}
          >
            <RevenueChart data={dailyData} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Last 10 Sales */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-zinc-100 text-base">
            Últimas Vendas
          </CardTitle>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-violet-400 hover:text-violet-300 hover:bg-zinc-800"
          >
            <Link href="/dashboard/earnings">Ver todas</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {last10Sales.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              Nenhuma venda ainda. Crie um bot e publique conteúdo para começar!
            </p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-4 pb-2 text-xs font-medium text-zinc-500">
                <span>Conteúdo</span>
                <span>Bot</span>
                <span>Data</span>
                <span className="text-right">Valor</span>
              </div>
              {last10Sales.map((sale) => (
                <div
                  key={sale.id}
                  className="grid grid-cols-4 rounded-md px-0 py-2 text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="truncate pr-2">
                    {sale.content?.title ?? "—"}
                  </span>
                  <span className="truncate pr-2 text-zinc-400">
                    {sale.bot?.name ?? "—"}
                  </span>
                  <span className="text-zinc-500 text-xs self-center">
                    {sale.paidAt ? formatDateTime(sale.paidAt) : "—"}
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <Badge
                      variant={getStatusVariant(sale.status ?? "")}
                      className="text-xs"
                    >
                      {getStatusLabel(sale.status ?? "")}
                    </Badge>
                    <span className="font-medium text-emerald-400">
                      {formatCurrency(sale.creatorNet)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
