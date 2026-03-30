import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Mail,
  Calendar,
  Bot,
  ShoppingCart,
  DollarSign,
  TrendingUp,
} from "lucide-react"
import { auth } from "@/lib/auth"
import { getUserStats } from "@/server/queries/users"
import { getBotsByUserId } from "@/server/queries/bots"
import { getDailyEarnings } from "@/server/queries/earnings"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/shared/metric-card"
import { Separator } from "@/components/ui/separator"
import { UserDetailClient } from "./user-detail-client"

interface UserDetailPageProps {
  params: Promise<{ userId: string }>
}

export default async function AdminUserDetailPage({ params }: UserDetailPageProps) {
  const session = await auth()
  if (!session?.user || (session.user.role !== "owner" && session.user.role !== "admin")) {
    redirect("/login")
  }

  const { userId } = await params
  const [userStats, userBots] = await Promise.all([
    getUserStats(userId),
    getBotsByUserId(userId),
  ])

  if (!userStats) {
    notFound()
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const dailyData = await getDailyEarnings(userId, thirtyDaysAgo, now)

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Usuários
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{userStats.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Mail className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-sm text-zinc-400">{userStats.email}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={userStats.role} />
          <StatusBadge isActive={userStats.isActive} />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Receita Total"
          value={formatCurrency(parseFloat(userStats.totalRevenue))}
          icon={DollarSign}
          description="Bruta acumulada"
          iconClassName="bg-emerald-600/20 text-emerald-400"
        />
        <MetricCard
          title="Receita Líquida"
          value={formatCurrency(parseFloat(userStats.totalCreatorNet))}
          icon={TrendingUp}
          description="Após taxas da plataforma"
          iconClassName="bg-violet-600/20 text-violet-400"
        />
        <MetricCard
          title="Total Vendas"
          value={String(userStats.totalSales)}
          icon={ShoppingCart}
          description="Transações pagas"
          iconClassName="bg-blue-600/20 text-blue-400"
        />
        <MetricCard
          title="Bots Ativos"
          value={`${userStats.activeBots}/${userStats.totalBots}`}
          icon={Bot}
          description="Ativos / Total"
          iconClassName="bg-amber-600/20 text-amber-400"
        />
      </div>

      {/* User info card + edit fee */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100 text-base">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Nome</span>
              <span className="text-zinc-200">{userStats.name}</span>
            </div>
            <Separator className="bg-zinc-800" />
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Email</span>
              <span className="text-zinc-200">{userStats.email}</span>
            </div>
            <Separator className="bg-zinc-800" />
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Role</span>
              <RoleBadge role={userStats.role} />
            </div>
            <Separator className="bg-zinc-800" />
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Status</span>
              <StatusBadge isActive={userStats.isActive} />
            </div>
            <Separator className="bg-zinc-800" />
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Cadastro</span>
              <span className="text-zinc-200 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                {userStats.createdAt ? formatDate(userStats.createdAt) : "—"}
              </span>
            </div>
            <Separator className="bg-zinc-800" />
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Taxa plataforma</span>
              <span className="text-zinc-200">
                {userStats.platformFeePercent
                  ? `${parseFloat(userStats.platformFeePercent).toFixed(1)}%`
                  : "Padrão"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Edit platform fee */}
        <UserDetailClient
          userId={userId}
          currentPlatformFee={
            userStats.platformFeePercent
              ? parseFloat(userStats.platformFeePercent)
              : null
          }
          currentIsActive={userStats.isActive ?? false}
          currentRole={userStats.role}
          callerRole={session.user.role}
        />

        {/* User Bots */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100 text-base">Bots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {userBots.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhum bot criado.</p>
            )}
            {userBots.map((bot) => (
              <div
                key={bot.id}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-800"
              >
                <div>
                  <p className="text-zinc-200 text-sm font-medium">{bot.name}</p>
                  {bot.username && (
                    <p className="text-zinc-500 text-xs">@{bot.username}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={bot.isActive ? "default" : "secondary"}
                    className={
                      bot.isActive
                        ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
                        : "bg-zinc-700 text-zinc-400"
                    }
                  >
                    {bot.isActive ? "Ativo" : "Inativo"}
                  </Badge>
                  <span className="text-zinc-300 text-sm font-medium">
                    {formatCurrency(parseFloat(bot.totalRevenue ?? "0"))}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Earnings chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 text-base">Ganhos — últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <UserEarningsChartClient data={dailyData} />
        </CardContent>
      </Card>
    </div>
  )
}

function RoleBadge({ role }: { role: "owner" | "admin" | "creator" }) {
  if (role === "owner") {
    return <Badge variant="destructive" className="text-xs">Owner</Badge>
  }
  if (role === "admin") {
    return (
      <Badge variant="default" className="text-xs bg-violet-600 hover:bg-violet-700">
        Admin
      </Badge>
    )
  }
  return <Badge variant="secondary" className="text-xs">Creator</Badge>
}

function StatusBadge({ isActive }: { isActive: boolean | null }) {
  if (isActive) {
    return (
      <Badge className="text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/20">
        Ativo
      </Badge>
    )
  }
  return <Badge variant="secondary" className="text-xs">Inativo</Badge>
}

import { UserEarningsChartClient } from "./user-earnings-chart"
