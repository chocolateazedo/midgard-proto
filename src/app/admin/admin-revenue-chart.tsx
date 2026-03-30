"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface DayData {
  date: string
  totalAmount: string
  totalPlatformFee: string
  totalCreatorNet: string
  salesCount: number
}

interface AdminRevenueChartProps {
  data: DayData[]
}

function formatShortDate(dateStr: string) {
  const [, month, day] = dateStr.split("-")
  return `${day}/${month}`
}

export function AdminRevenueChart({ data }: AdminRevenueChartProps) {
  const chartData = data.map((d) => ({
    date: formatShortDate(d.date),
    receita: parseFloat(d.totalAmount),
    taxa: parseFloat(d.totalPlatformFee),
    liquido: parseFloat(d.totalCreatorNet),
  }))

  if (chartData.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-zinc-500 text-sm">
        Nenhuma venda nos últimos 30 dias
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="adminRevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) =>
            v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
          }
          width={52}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: "8px",
            color: "#f4f4f5",
          }}
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              receita: "Receita Bruta",
              taxa: "Taxa Plataforma",
              liquido: "Líquido Creators",
            }
            return [
              new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value),
              labels[name] ?? name,
            ]
          }}
          labelStyle={{ color: "#a1a1aa" }}
        />
        <Area
          type="monotone"
          dataKey="receita"
          stroke="#7c3aed"
          strokeWidth={2}
          fill="url(#adminRevGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "#7c3aed" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
