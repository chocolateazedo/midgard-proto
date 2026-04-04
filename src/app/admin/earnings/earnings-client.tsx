"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { Download } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"

type Purchase = {
  id: string
  amount: number
  platformFee: number
  creatorNet: number
  status: "pending" | "paid" | "expired" | "refunded" | null
  paidAt: Date | null
  createdAt: Date | null
  content: { id: string; title: string; type: string } | null
  bot: { id: string; name: string; username: string | null } | null
  botUser: {
    id: string
    telegramUsername: string | null
    telegramFirstName: string | null
  } | null
}

type DayData = {
  date: string
  totalAmount: string
  totalPlatformFee: string
  totalCreatorNet: string
  salesCount: number
}

type CreatorRow = {
  userId: string
  name: string
  email: string
  avatarUrl: string | null
  totalRevenue: string
  totalCreatorNet: string
  totalSales: number
  activeBots: number
}

type BotRow = {
  botId: string
  name: string
  username: string | null
  isActive: boolean | null
  creatorId: string
  creatorName: string
  totalRevenue: string
  totalCreatorNet: string
  totalSales: number
  totalSubscribers: number | null
}

interface AdminEarningsClientProps {
  purchases: Purchase[]
  dailyData: DayData[]
  topCreators: CreatorRow[]
  topBots: BotRow[]
  period: string
  fromDate: string
  toDate: string
}

export function AdminEarningsClient({
  purchases,
  dailyData,
  topCreators,
  topBots,
  period,
  fromDate,
  toDate,
}: AdminEarningsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [customFrom, setCustomFrom] = React.useState(fromDate)
  const [customTo, setCustomTo] = React.useState(toDate)

  const totalGross = purchases.reduce((s, p) => s + p.amount, 0)
  const totalFees = purchases.reduce((s, p) => s + p.platformFee, 0)
  const totalNet = purchases.reduce((s, p) => s + p.creatorNet, 0)

  const chartData = dailyData.map((d) => {
    const [, month, day] = d.date.split("-")
    return {
      date: `${day}/${month}`,
      receita: parseFloat(d.totalAmount),
      taxa: parseFloat(d.totalPlatformFee),
    }
  })

  function changePeriod(p: string) {
    const sp = new URLSearchParams()
    sp.set("period", p)
    router.push(`${pathname}?${sp.toString()}`)
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return
    const sp = new URLSearchParams()
    sp.set("period", "custom")
    sp.set("from", customFrom)
    sp.set("to", customTo)
    router.push(`${pathname}?${sp.toString()}`)
  }

  function exportCSV() {
    const rows = [
      ["Data", "Conteúdo", "Bot", "Valor", "Taxa", "Líquido", "Status"],
      ...purchases.map((p) => [
        p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt!),
        p.content?.title ?? "Acesso à Live",
        p.bot?.name ?? "—",
        p.amount,
        p.platformFee,
        p.creatorNet,
        p.status,
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `receita-${period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Receita Global</h1>
          <p className="text-sm text-slate-500 mt-1">Visão financeira da plataforma</p>
        </div>
        <Button
          variant="outline"
          onClick={exportCSV}
          className="border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shrink-0"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Period selector */}
      <Card className="bg-white border-slate-200/60">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => changePeriod(p)}
                className={
                  period === p
                    ? "bg-primary-600 hover:bg-primary-700 text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }
              >
                {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "90 dias"}
              </Button>
            ))}
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <Label className="text-slate-500 text-xs">De</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 w-36 bg-slate-100 border-slate-200 text-slate-900 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-500 text-xs">Até</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 w-36 bg-slate-100 border-slate-200 text-slate-900 text-sm"
                />
              </div>
              <Button
                size="sm"
                variant={period === "custom" ? "default" : "outline"}
                onClick={applyCustomRange}
                className={
                  period === "custom"
                    ? "bg-primary-600 hover:bg-primary-700 text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }
              >
                Aplicar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Receita Bruta</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalGross)}</p>
            <p className="text-xs text-slate-400 mt-1">{purchases.length} transação(ões)</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Taxas Coletadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary-600">{formatCurrency(totalFees)}</p>
            <p className="text-xs text-slate-400 mt-1">
              {totalGross > 0 ? ((totalFees / totalGross) * 100).toFixed(1) : "0"}% da receita bruta
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Receita Líquida Creators</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalNet)}</p>
            <p className="text-xs text-slate-400 mt-1">Após deduções da plataforma</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">Receita por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center text-slate-400 text-sm">
              Nenhuma venda no período selecionado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                  }
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    color: "#0f172a",
                  }}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      receita: "Receita Bruta",
                      taxa: "Taxa Plataforma",
                    }
                    return [
                      new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(value),
                      labels[name] ?? name,
                    ]
                  }}
                  labelStyle={{ color: "#64748b" }}
                />
                <Bar dataKey="receita" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Bar dataKey="taxa" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breakdown by creator */}
        <Card className="bg-white border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-slate-900 text-base">Por Creator</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200/60 hover:bg-transparent">
                  <TableHead className="text-slate-500 pl-6">Creator</TableHead>
                  <TableHead className="text-slate-500">Bruto</TableHead>
                  <TableHead className="text-slate-500">Taxa</TableHead>
                  <TableHead className="text-slate-500 text-right pr-6">Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCreators.length === 0 && (
                  <TableRow className="border-slate-200/60 hover:bg-transparent">
                    <TableCell colSpan={4} className="text-center text-slate-400 py-6 pl-6">
                      Sem dados
                    </TableCell>
                  </TableRow>
                )}
                {topCreators.map((c) => {
                  const gross = parseFloat(c.totalRevenue)
                  const net = parseFloat(c.totalCreatorNet)
                  const fee = gross - net
                  return (
                    <TableRow key={c.userId} className="border-slate-200/60 hover:bg-slate-50/50">
                      <TableCell className="pl-6">
                        <div>
                          <p className="text-slate-800 text-sm font-medium">{c.name}</p>
                          <p className="text-slate-400 text-xs">{c.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-700 text-sm">
                        {formatCurrency(gross)}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {formatCurrency(fee)}
                      </TableCell>
                      <TableCell className="text-emerald-600 text-sm font-medium text-right pr-6">
                        {formatCurrency(net)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Breakdown by bot */}
        <Card className="bg-white border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-slate-900 text-base">Por Bot</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200/60 hover:bg-transparent">
                  <TableHead className="text-slate-500 pl-6">Bot</TableHead>
                  <TableHead className="text-slate-500">Creator</TableHead>
                  <TableHead className="text-slate-500 text-right pr-6">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topBots.length === 0 && (
                  <TableRow className="border-slate-200/60 hover:bg-transparent">
                    <TableCell colSpan={3} className="text-center text-slate-400 py-6 pl-6">
                      Sem dados
                    </TableCell>
                  </TableRow>
                )}
                {topBots.map((b) => (
                  <TableRow key={b.botId} className="border-slate-200/60 hover:bg-slate-50/50">
                    <TableCell className="pl-6">
                      <div>
                        <p className="text-slate-800 text-sm font-medium">{b.name}</p>
                        {b.username && (
                          <p className="text-slate-400 text-xs">@{b.username}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">{b.creatorName}</TableCell>
                    <TableCell className="text-slate-800 font-medium text-sm text-right pr-6">
                      {formatCurrency(parseFloat(b.totalRevenue))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* All sales table */}
      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">
            Todas as Vendas ({purchases.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[480px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow className="border-slate-200/60 hover:bg-transparent">
                  <TableHead className="text-slate-500 pl-6">Data</TableHead>
                  <TableHead className="text-slate-500">Conteúdo</TableHead>
                  <TableHead className="text-slate-500">Bot</TableHead>
                  <TableHead className="text-slate-500">Valor</TableHead>
                  <TableHead className="text-slate-500">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.length === 0 && (
                  <TableRow className="border-slate-200/60 hover:bg-transparent">
                    <TableCell colSpan={5} className="text-center text-slate-400 py-8 pl-6">
                      Nenhuma venda no período selecionado.
                    </TableCell>
                  </TableRow>
                )}
                {purchases.map((p) => (
                  <TableRow key={p.id} className="border-slate-200/60 hover:bg-slate-50/50">
                    <TableCell className="pl-6 text-slate-500 text-sm">
                      {p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt!)}
                    </TableCell>
                    <TableCell className="text-slate-700 text-sm">
                      {p.content?.title ?? "Acesso à Live"}
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {p.bot?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-slate-800 text-sm font-medium">
                      {formatCurrency(p.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          p.status === "paid"
                            ? "bg-emerald-100 text-emerald-600 border-emerald-600/30 text-xs"
                            : p.status === "pending"
                            ? "bg-amber-600/20 text-amber-600 border-amber-600/30 text-xs"
                            : "bg-slate-200 text-slate-500 text-xs"
                        }
                      >
                        {p.status === "paid"
                          ? "Pago"
                          : p.status === "pending"
                          ? "Pendente"
                          : p.status === "expired"
                          ? "Expirado"
                          : "Reembolsado"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
