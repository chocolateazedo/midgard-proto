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
  salesCount: number
}

export function UserEarningsChartClient({ data }: { data: DayData[] }) {
  const chartData = data.map((d) => {
    const [, month, day] = d.date.split("-")
    return {
      date: `${day}/${month}`,
      receita: parseFloat(d.totalAmount),
    }
  })

  if (chartData.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-zinc-500 text-sm">
        Nenhuma venda nos últimos 30 dias
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="userEarnGrad" x1="0" y1="0" x2="0" y2="1">
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
          width={48}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: "8px",
            color: "#f4f4f5",
          }}
          formatter={(value: number) => [
            new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value),
            "Receita",
          ]}
          labelStyle={{ color: "#a1a1aa" }}
        />
        <Area
          type="monotone"
          dataKey="receita"
          stroke="#7c3aed"
          strokeWidth={2}
          fill="url(#userEarnGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "#7c3aed" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
