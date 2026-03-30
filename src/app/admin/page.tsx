import { redirect } from "next/navigation"
import {
  DollarSign,
  TrendingUp,
  Users,
  Bot,
  ShoppingCart,
  MessagesSquare,
} from "lucide-react"
import { auth } from "@/lib/auth"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { MetricCard } from "@/components/shared/metric-card"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { getPlatformEarnings, getDailyEarnings, getTopCreators, getTopBots } from "@/server/queries/earnings"
import { getAllUsers } from "@/server/queries/users"
import { getAllBots } from "@/server/queries/bots"
import { AdminRevenueChart } from "./admin-revenue-chart"

export default async function AdminDashboardPage() {
  const session = await auth()
  if (!session?.user || (session.user.role !== "owner" && session.user.role !== "admin")) {
    redirect("/login")
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const [
    allEarnings,
    todayEarnings,
    dailyData,
    topCreators,
    topBots,
    usersData,
    allBotsData,
  ] = await Promise.all([
    getPlatformEarnings(thirtyDaysAgo, now),
    getPlatformEarnings(todayStart, now),
    getDailyEarnings(null, thirtyDaysAgo, now),
    getTopCreators(5),
    getTopBots(5),
    getAllUsers(1, 1000),
    getAllBots(),
  ])

  const totalRevenue = allEarnings.reduce((sum, p) => sum + p.amount, 0)
  const totalFees = allEarnings.reduce((sum, p) => sum + p.platformFee, 0)
  const salesToday = todayEarnings.length
  const activeCreators = usersData.users.filter(u => u.isActive && u.role === "creator").length
  const activeBots = allBotsData.filter(b => b.isActive).length

  // Count unique telegram users across all bots
  const totalTelegramUsers = allBotsData.reduce((sum, b) => sum + (b.totalSubscribers ?? 0), 0)

  // Latest 10 sales
  const latestSales = allEarnings.slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Admin Dashboard</h1>
        <p className="text-sm text-zinc-400 mt-1">Visão geral da plataforma</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Receita Total (30d)"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          description="Todas as vendas pagas"
          iconClassName="bg-emerald-600/20 text-emerald-400"
        />
        <MetricCard
          title="Taxas Coletadas (30d)"
          value={formatCurrency(totalFees)}
          icon={TrendingUp}
          description="Taxa da plataforma"
          iconClassName="bg-violet-600/20 text-violet-400"
        />
        <MetricCard
          title="Creators Ativos"
          value={String(activeCreators)}
          icon={Users}
          description="Creators com conta ativa"
          iconClassName="bg-blue-600/20 text-blue-400"
        />
        <MetricCard
          title="Bots Ativos"
          value={String(activeBots)}
          icon={Bot}
          description="Bots em execução"
          iconClassName="bg-amber-600/20 text-amber-400"
        />
        <MetricCard
          title="Vendas Hoje"
          value={String(salesToday)}
          icon={ShoppingCart}
          description="Transações confirmadas"
          iconClassName="bg-pink-600/20 text-pink-400"
        />
        <MetricCard
          title="Usuários Telegram"
          value={String(totalTelegramUsers)}
          icon={MessagesSquare}
          description="Assinantes em todos os bots"
          iconClassName="bg-cyan-600/20 text-cyan-400"
        />
      </div>

      {/* Revenue Chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 text-base">Receita — últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminRevenueChart data={dailyData} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Creators */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100 text-base">Top 5 Creators</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 pl-6">Creator</TableHead>
                  <TableHead className="text-zinc-400">Vendas</TableHead>
                  <TableHead className="text-zinc-400 text-right pr-6">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCreators.length === 0 && (
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableCell colSpan={3} className="text-center text-zinc-500 py-6 pl-6">
                      Nenhum dado disponível
                    </TableCell>
                  </TableRow>
                )}
                {topCreators.map((creator, i) => (
                  <TableRow key={creator.userId} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500 text-sm w-4">{i + 1}</span>
                        <div>
                          <p className="text-zinc-200 font-medium text-sm">{creator.name}</p>
                          <p className="text-zinc-500 text-xs">{creator.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-300 text-sm">{creator.totalSales}</TableCell>
                    <TableCell className="text-zinc-200 font-medium text-sm text-right pr-6">
                      {formatCurrency(parseFloat(creator.totalRevenue))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top Bots */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100 text-base">Top 5 Bots</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 pl-6">Bot</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400 text-right pr-6">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topBots.length === 0 && (
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableCell colSpan={3} className="text-center text-zinc-500 py-6 pl-6">
                      Nenhum dado disponível
                    </TableCell>
                  </TableRow>
                )}
                {topBots.map((bot, i) => (
                  <TableRow key={bot.botId} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500 text-sm w-4">{i + 1}</span>
                        <div>
                          <p className="text-zinc-200 font-medium text-sm">{bot.name}</p>
                          <p className="text-zinc-500 text-xs">
                            {bot.username ? `@${bot.username}` : bot.creatorName}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="text-zinc-200 font-medium text-sm text-right pr-6">
                      {formatCurrency(parseFloat(bot.totalRevenue))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Latest Sales */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 text-base">Últimas Vendas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 pl-6">Conteúdo</TableHead>
                <TableHead className="text-zinc-400">Bot</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Data</TableHead>
                <TableHead className="text-zinc-400 text-right pr-6">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latestSales.length === 0 && (
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center text-zinc-500 py-8 pl-6">
                    Nenhuma venda registrada
                  </TableCell>
                </TableRow>
              )}
              {latestSales.map((sale) => (
                <TableRow key={sale.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell className="pl-6">
                    <p className="text-zinc-200 text-sm font-medium">
                      {sale.content?.title ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">
                    {sale.bot?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={sale.status === "paid" ? "default" : "secondary"}
                      className={
                        sale.status === "paid"
                          ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
                          : sale.status === "pending"
                          ? "bg-amber-600/20 text-amber-400 border-amber-600/30"
                          : "bg-zinc-700 text-zinc-400"
                      }
                    >
                      {sale.status === "paid"
                        ? "Pago"
                        : sale.status === "pending"
                        ? "Pendente"
                        : sale.status === "expired"
                        ? "Expirado"
                        : "Reembolsado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">
                    {sale.paidAt ? formatDateTime(sale.paidAt) : formatDateTime(sale.createdAt!)}
                  </TableCell>
                  <TableCell className="text-zinc-200 font-medium text-sm text-right pr-6">
                    {formatCurrency(sale.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
