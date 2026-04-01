"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DailyRow {
  date: string;
  totalCreatorNet: string;
  totalAmount: string;
  salesCount: number;
}

interface RevenueChartProps {
  data: DailyRow[];
}

function formatShortDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

export function RevenueChart({ data }: RevenueChartProps) {
  const chartData = data.map((row) => ({
    date: formatShortDate(row.date),
    receita: parseFloat(row.totalCreatorNet),
    vendas: row.salesCount,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 text-sm">
        Nenhum dado de receita disponível ainda.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart
        data={chartData}
        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            v === 0 ? "0" : `R$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`
          }
          width={56}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            color: "#0f172a",
            fontSize: 13,
          }}
          labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
          formatter={(value: number) => [
            `R$ ${value.toFixed(2).replace(".", ",")}`,
            "Receita líquida",
          ]}
        />
        <Area
          type="monotone"
          dataKey="receita"
          stroke="#0d9488"
          strokeWidth={2}
          fill="url(#colorReceita)"
          dot={false}
          activeDot={{ r: 4, fill: "#0d9488", stroke: "#ffffff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
