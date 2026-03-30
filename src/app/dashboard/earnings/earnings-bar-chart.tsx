"use client";

import {
  BarChart,
  Bar,
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
  totalPlatformFee: string;
  salesCount: number;
}

interface EarningsBarChartProps {
  data: DailyRow[];
}

function formatShortDate(dateStr: string) {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

export function EarningsBarChart({ data }: EarningsBarChartProps) {
  const chartData = data.map((row) => ({
    date: formatShortDate(row.date),
    liquido: parseFloat(row.totalCreatorNet),
    taxa: parseFloat(row.totalPlatformFee),
    vendas: row.salesCount,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-500 text-sm">
        Nenhum dado de receita disponível para o período selecionado.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        barSize={chartData.length > 20 ? 8 : 16}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
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
          tickFormatter={(v: number) =>
            v === 0
              ? "0"
              : `R$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`
          }
          width={56}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: "6px",
            color: "#f4f4f5",
            fontSize: 13,
          }}
          labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              liquido: "Receita líquida",
              taxa: "Taxa plataforma",
            };
            return [`R$ ${value.toFixed(2).replace(".", ",")}`, labels[name] ?? name];
          }}
        />
        <Bar
          dataKey="liquido"
          fill="#7c3aed"
          radius={[3, 3, 0, 0]}
          opacity={0.9}
        />
        <Bar
          dataKey="taxa"
          fill="#3f3f46"
          radius={[3, 3, 0, 0]}
          opacity={0.7}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
