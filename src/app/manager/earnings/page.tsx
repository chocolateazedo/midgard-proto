import { redirect } from "next/navigation";
import { DollarSign, TrendingUp, Crown, Landmark, Wallet } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getManagerStats, getManagerCreators } from "@/server/queries/managers";
import { MetricCard } from "@/components/shared/metric-card";
import {
  Card,
  CardContent,
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
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function ManagerEarningsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const stats = await getManagerStats(session.user.id);
  const creators = await getManagerCreators(session.user.id);

  // Últimas 50 transações onde managerUserId = eu
  const [purchases, subscriptions] = await Promise.all([
    db.purchase.findMany({
      where: { managerUserId: session.user.id, status: "paid", amount: { gt: 0 } },
      include: {
        content: { select: { title: true } },
        bot: { select: { name: true } },
        creatorUser: { select: { name: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
    db.subscription.findMany({
      where: { managerUserId: session.user.id, paidAt: { not: null } },
      include: {
        plan: { select: { name: true } },
        bot: { select: { name: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
  ]);

  type Row = {
    id: string;
    kind: "purchase" | "subscription";
    title: string;
    botName: string;
    amount: number;
    managerFee: number;
    paidAt: Date | null;
  };
  const rows: Row[] = [
    ...purchases.map((p) => ({
      id: p.id,
      kind: "purchase" as const,
      title: p.content?.title ?? "Acesso à Live",
      botName: p.bot.name,
      amount: p.amount.toNumber(),
      managerFee: p.managerFee.toNumber(),
      paidAt: p.paidAt,
    })),
    ...subscriptions.map((s) => ({
      id: s.id,
      kind: "subscription" as const,
      title: s.plan.name,
      botName: s.bot.name,
      amount: s.amount.toNumber(),
      managerFee: s.managerFee.toNumber(),
      paidAt: s.paidAt,
    })),
  ]
    .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))
    .slice(0, 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Receita</h1>
        <p className="text-sm text-slate-500 mt-1">
          Sua receita como gestor + bruto gerado pelos seus creators
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Bruto dos Creators (30d)"
          value={formatCurrency(parseFloat(stats.creatorsGross))}
          icon={DollarSign}
          description={`Lifetime: ${formatCurrency(parseFloat(stats.lifetimeGross))}`}
          iconClassName="bg-emerald-100 text-emerald-600"
        />
        <MetricCard
          title="Taxa da Plataforma (30d)"
          value={formatCurrency(parseFloat(stats.platformFees))}
          icon={Landmark}
          description={`Lifetime: ${formatCurrency(parseFloat(stats.lifetimePlatformFees))}`}
          iconClassName="bg-red-100 text-red-600"
        />
        <MetricCard
          title="Sua Receita (30d)"
          value={formatCurrency(parseFloat(stats.managerEarnings))}
          icon={Crown}
          description={`Lifetime: ${formatCurrency(parseFloat(stats.lifetimeManagerEarnings))}`}
          iconClassName="bg-amber-100 text-amber-700"
        />
        <MetricCard
          title="Líquido dos Creators (30d)"
          value={formatCurrency(parseFloat(stats.creatorsNet))}
          icon={Wallet}
          description={`Lifetime: ${formatCurrency(parseFloat(stats.lifetimeCreatorsNet))}`}
          iconClassName="bg-blue-100 text-blue-600"
        />
      </div>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Por Creator (lifetime)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Creator</TableHead>
                <TableHead>Sua taxa</TableHead>
                <TableHead>Bruto</TableHead>
                <TableHead>Taxa da Plataforma</TableHead>
                <TableHead>Sua Receita</TableHead>
                <TableHead className="text-right pr-6">Líquido do Creator</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creators.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                    Nenhum creator ainda.
                  </TableCell>
                </TableRow>
              )}
              {creators.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-6">
                    <p className="text-sm font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.email}</p>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {c.managerFeePercent?.toFixed(1) ?? "—"}%
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {formatCurrency(parseFloat(c.totalGross))}
                  </TableCell>
                  <TableCell className="text-sm text-red-600">
                    {formatCurrency(parseFloat(c.platformFees))}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-amber-700">
                    {formatCurrency(parseFloat(c.managerEarnings))}
                  </TableCell>
                  <TableCell className="text-right pr-6 text-sm font-medium text-emerald-600">
                    {formatCurrency(parseFloat(c.creatorNet))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Últimas Transações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Bruto</TableHead>
                <TableHead className="text-right pr-6">Sua Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                    Nenhuma transação ainda.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-6 text-sm text-slate-500">
                    {r.paidAt ? formatDateTime(r.paidAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        r.kind === "subscription"
                          ? "bg-purple-100 text-purple-700 text-xs"
                          : "bg-blue-100 text-blue-700 text-xs"
                      }
                    >
                      {r.kind === "subscription" ? "Assinatura" : "Conteúdo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{r.title}</TableCell>
                  <TableCell className="text-sm text-slate-500">{r.botName}</TableCell>
                  <TableCell className="text-sm text-slate-700">{formatCurrency(r.amount)}</TableCell>
                  <TableCell className="text-right pr-6 text-sm font-semibold text-amber-700">
                    {formatCurrency(r.managerFee)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
