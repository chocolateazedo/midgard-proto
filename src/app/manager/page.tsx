import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Bot,
  UsersRound,
  Crown,
  DollarSign,
  TrendingUp,
  Briefcase,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { getManagerStats } from "@/server/queries/managers";
import { formatCurrency } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";

export default async function ManagerDashboardPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") {
    redirect("/login");
  }

  const stats = await getManagerStats(session.user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5 text-amber-600" />
            Painel de Gestor de Creators
          </p>
        </div>
        <Button
          asChild
          className="bg-primary-600 hover:bg-primary-700 text-white shrink-0"
        >
          <Link href="/manager/creators">Gerenciar Creators</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Receita do Gestor (30d)"
          value={formatCurrency(parseFloat(stats.managerEarnings))}
          icon={TrendingUp}
          description={`Lifetime: ${formatCurrency(parseFloat(stats.lifetimeManagerEarnings))}`}
          iconClassName="bg-amber-100 text-amber-600"
        />
        <MetricCard
          title="Bruto dos Creators (30d)"
          value={formatCurrency(parseFloat(stats.creatorsGross))}
          icon={DollarSign}
          description={`Lifetime: ${formatCurrency(parseFloat(stats.lifetimeGross))}`}
          iconClassName="bg-emerald-100 text-emerald-600"
        />
        <MetricCard
          title="Creators"
          value={`${stats.activeCreators}/${stats.totalCreators}`}
          icon={Users}
          description="Ativos / Total"
          iconClassName="bg-blue-100 text-blue-600"
        />
        <MetricCard
          title="Bots"
          value={`${stats.activeBots}/${stats.totalBots}`}
          icon={Bot}
          description="Ativos / Total"
          iconClassName="bg-primary-100 text-primary-600"
        />
        <MetricCard
          title="Membros"
          value={String(stats.totalMembers)}
          icon={UsersRound}
          description="Usuários Telegram"
          iconClassName="bg-cyan-100 text-cyan-600"
        />
        <MetricCard
          title="Assinantes Ativos"
          value={String(stats.activeSubscribers)}
          icon={Crown}
          description="Com plano em vigência"
          iconClassName="bg-purple-100 text-purple-600"
        />
      </div>
    </div>
  );
}
