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

  const allEarnings = await getPlatformEarnings(thirtyDaysAgo, now)
  const todayEarnings = await getPlatformEarnings(todayStart, now)
  const dailyData = await getDailyEarnings(null, thirtyDaysAgo, now)
  const topCreators = await getTopCreators(5)
  const topBots = await getTopBots(5)
  const usersData = await getAllUsers(1, 1000)
  const allBotsData = await getAllBots()

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
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Visão geral da plataforma</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Receita Total (30d)"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          description="Todas as vendas pagas"
          iconClassName="bg-emerald-100 text-emerald-600"
        />
        <MetricCard
          title="Taxas Coletadas (30d)"
          value={formatCurrency(totalFees)}
          icon={TrendingUp}
          description="Taxa da plataforma"
          iconClassName="bg-primary-100 text-primary-600"
        />
        <MetricCard
          title="Creators Ativos"
          value={String(activeCreators)}
          icon={Users}
          description="Creators com conta ativa"
          iconClassName="bg-blue-100 text-blue-600"
        />
        <MetricCard
          title="Bots Ativos"
          value={String(activeBots)}
          icon={Bot}
          description="Bots em execução"
          iconClassName="bg-amber-100 text-amber-600"
        />
        <MetricCard
          title="Vendas Hoje"
          value={String(salesToday)}
          icon={ShoppingCart}
          description="Transações confirmadas"
          iconClassName="bg-pink-100 text-pink-600"
        />
        <MetricCard
          title="Usuários Telegram"
          value={String(totalTelegramUsers)}
          icon={MessagesSquare}
          description="Assinantes em todos os bots"
          iconClassName="bg-cyan-100 text-cyan-600"
        />
      </div>

      {/* Revenue Chart */}
      <Card className="border-slate-200/60 bg-white rounded-xl">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">Receita — últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminRevenueChart data={dailyData} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Creators */}
        <Card className="border-slate-200/60 bg-white rounded-xl">
          <CardHeader>
            <CardTitle className="text-slate-900 text-base">Top 5 Creators</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200/60 hover:bg-transparent">
                  <TableHead className="text-slate-500 pl-6">Creator</TableHead>
                  <TableHead className="text-slate-500">Vendas</TableHead>
                  <TableHead className="text-slate-500 text-right pr-6">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCreators.length === 0 && (
                  <TableRow className="border-slate-200/60 hover:bg-transparent">
                    <TableCell colSpan={3} className="text-center text-slate-400 py-6 pl-6">
                      Nenhum dado disponível
                    </TableCell>
                  </TableRow>
                )}
                {topCreators.map((creator, i) => (
                  <TableRow key={creator.userId} className="border-slate-200/60 hover:bg-slate-50/50">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-sm w-4">{i + 1}</span>
                        <div>
                          <p className="text-slate-800 font-medium text-sm">{creator.name}</p>
                          <p className="text-slate-400 text-xs">{creator.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-700 text-sm">{creator.totalSales}</TableCell>
                    <TableCell className="text-slate-800 font-medium text-sm text-right pr-6">
                      {formatCurrency(parseFloat(creator.totalRevenue))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top Bots */}
        <Card className="border-slate-200/60 bg-white rounded-xl">
          <CardHeader>
            <CardTitle className="text-slate-900 text-base">Top 5 Bots</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200/60 hover:bg-transparent">
                  <TableHead className="text-slate-500 pl-6">Bot</TableHead>
                  <TableHead className="text-slate-500">Status</TableHead>
                  <TableHead className="text-slate-500 text-right pr-6">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topBots.length === 0 && (
                  <TableRow className="border-slate-200/60 hover:bg-transparent">
                    <TableCell colSpan={3} className="text-center text-slate-400 py-6 pl-6">
                      Nenhum dado disponível
                    </TableCell>
                  </TableRow>
                )}
                {topBots.map((bot, i) => (
                  <TableRow key={bot.botId} className="border-slate-200/60 hover:bg-slate-50/50">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-sm w-4">{i + 1}</span>
                        <div>
                          <p className="text-slate-800 font-medium text-sm">{bot.name}</p>
                          <p className="text-slate-400 text-xs">
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
                            ? "bg-emerald-100 text-emerald-600 border-emerald-200"
                            : "bg-slate-100 text-slate-500"
                        }
                      >
                        {bot.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-800 font-medium text-sm text-right pr-6">
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
      <Card className="border-slate-200/60 bg-white rounded-xl">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">Últimas Vendas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200/60 hover:bg-transparent">
                <TableHead className="text-slate-500 pl-6">Conteúdo</TableHead>
                <TableHead className="text-slate-500">Bot</TableHead>
                <TableHead className="text-slate-500">Status</TableHead>
                <TableHead className="text-slate-500">Data</TableHead>
                <TableHead className="text-slate-500 text-right pr-6">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latestSales.length === 0 && (
                <TableRow className="border-slate-200/60 hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center text-slate-400 py-8 pl-6">
                    Nenhuma venda registrada
                  </TableCell>
                </TableRow>
              )}
              {latestSales.map((sale) => (
                <TableRow key={sale.id} className="border-slate-200/60 hover:bg-slate-50/50">
                  <TableCell className="pl-6">
                    <p className="text-slate-800 text-sm font-medium">
                      {sale.content?.title ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {sale.bot?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={sale.status === "paid" ? "default" : "secondary"}
                      className={
                        sale.status === "paid"
                          ? "bg-emerald-100 text-emerald-600 border-emerald-200"
                          : sale.status === "pending"
                          ? "bg-amber-100 text-amber-600 border-amber-200"
                          : "bg-slate-100 text-slate-500"
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
                  <TableCell className="text-slate-500 text-sm">
                    {sale.paidAt ? formatDateTime(sale.paidAt) : formatDateTime(sale.createdAt!)}
                  </TableCell>
                  <TableCell className="text-slate-800 font-medium text-sm text-right pr-6">
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
