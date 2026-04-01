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
          <h1 className="text-2xl font-bold text-slate-900">
            Olá, {session.user.name.split(" ")[0]}!
          </h1>
          <p className="text-sm text-slate-400">
            Aqui está um resumo da sua atividade
          </p>
        </div>
        <Button asChild className="bg-primary-600 hover:bg-primary-700 text-white">
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
          iconClassName="bg-emerald-100 text-emerald-600"
        />
        <MetricCard
          title="Ganhos Totais"
          value={formatCurrency(totalLifetime)}
          icon={TrendingUp}
          iconClassName="bg-primary-100 text-primary-600"
        />
        <MetricCard
          title="Bots Ativos"
          value={String(activeBots)}
          icon={Bot}
          iconClassName="bg-blue-100 text-blue-600"
        />
        <MetricCard
          title="Assinantes"
          value={String(totalSubscribers)}
          icon={Users}
          iconClassName="bg-amber-100 text-amber-600"
        />
        <MetricCard
          title="Vendas Hoje"
          value={String(salesToday)}
          icon={ShoppingCart}
          iconClassName="bg-pink-100 text-pink-600"
        />
      </div>

      {/* Revenue Chart */}
      <Card className="border-slate-200/60 bg-white rounded-xl">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">
            Receita — Últimos 30 Dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={<Skeleton className="h-64 w-full bg-slate-100" />}
          >
            <RevenueChart data={dailyData} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Last 10 Sales */}
      <Card className="border-slate-200/60 bg-white rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-slate-900 text-base">
            Últimas Vendas
          </CardTitle>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-primary-600 hover:text-primary-700 hover:bg-primary-50"
          >
            <Link href="/dashboard/earnings">Ver todas</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {last10Sales.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Nenhuma venda ainda. Crie um bot e publique conteúdo para começar!
            </p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-4 pb-2 text-xs font-medium text-slate-400">
                <span>Conteúdo</span>
                <span>Bot</span>
                <span>Data</span>
                <span className="text-right">Valor</span>
              </div>
              {last10Sales.map((sale) => (
                <div
                  key={sale.id}
                  className="grid grid-cols-4 rounded-md px-0 py-2 text-sm text-slate-700 hover:bg-slate-50/50 transition-colors"
                >
                  <span className="truncate pr-2">
                    {sale.content?.title ?? "—"}
                  </span>
                  <span className="truncate pr-2 text-slate-500">
                    {sale.bot?.name ?? "—"}
                  </span>
                  <span className="text-slate-400 text-xs self-center">
                    {sale.paidAt ? formatDateTime(sale.paidAt) : "—"}
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <Badge
                      variant={getStatusVariant(sale.status ?? "")}
                      className="text-xs"
                    >
                      {getStatusLabel(sale.status ?? "")}
                    </Badge>
                    <span className="font-medium text-emerald-600">
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
