import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface MetricCardProps {
  title: string
  value: string
  icon: LucideIcon
  description?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  iconClassName?: string
  className?: string
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  iconClassName,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200/60 p-5 hover:shadow-md hover:border-slate-200 transition-all duration-200",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center",
            iconClassName ?? "bg-primary-100 text-primary-600"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900">{value}</p>

      <div className="mt-1 flex items-center gap-2">
        {trend !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              trend.isPositive ? "text-emerald-600" : "text-red-600"
            )}
          >
            {trend.isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {trend.isPositive ? "+" : ""}
            {trend.value.toFixed(1)}%
          </span>
        )}
        {description && (
          <p className="text-xs text-slate-400">{description}</p>
        )}
      </div>
    </div>
  )
}
