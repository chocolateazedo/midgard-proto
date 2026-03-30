import * as React from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
    <Card
      className={cn(
        "bg-zinc-900 border-zinc-800 text-zinc-100",
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">
          {title}
        </CardTitle>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md",
            iconClassName ?? "bg-violet-600/20"
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5",
              iconClassName ? "text-current" : "text-violet-400"
            )}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>

        <div className="mt-1 flex items-center gap-2">
          {trend !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                trend.isPositive ? "text-emerald-400" : "text-red-400"
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
            <p className="text-xs text-zinc-500">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
