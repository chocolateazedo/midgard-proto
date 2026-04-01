"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EarningsPeriodSelectorProps {
  currentPeriod: string;
}

const PERIODS = [
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "90 dias", value: "90d" },
];

export function EarningsPeriodSelector({
  currentPeriod,
}: EarningsPeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handlePeriodChange(period: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    params.delete("from");
    params.delete("to");
    router.push(`/dashboard/earnings?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200/60 bg-white p-1">
      {PERIODS.map((p) => (
        <Button
          key={p.value}
          variant="ghost"
          size="sm"
          onClick={() => handlePeriodChange(p.value)}
          className={cn(
            "text-xs h-7 px-3",
            currentPeriod === p.value
              ? "bg-primary-600 text-white hover:bg-primary-700"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          )}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
