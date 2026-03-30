import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Single card skeleton
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-900 p-6 space-y-3",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32 bg-zinc-800" />
        <Skeleton className="h-9 w-9 rounded-md bg-zinc-800" />
      </div>
      <Skeleton className="h-7 w-24 bg-zinc-800" />
      <Skeleton className="h-3 w-40 bg-zinc-800" />
    </div>
  )
}

// Metric cards row skeleton
function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

// Table skeleton
export function TableSkeleton({
  rows = 8,
  cols = 5,
  className,
}: {
  rows?: number
  cols?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-zinc-800 overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-4 bg-zinc-800"
              style={{ width: `${60 + (i % 3) * 20}px` }}
            />
          ))}
        </div>
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="border-b border-zinc-800 last:border-0 px-4 py-3"
        >
          <div className="flex items-center gap-6">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <Skeleton
                key={colIdx}
                className="h-4 bg-zinc-800"
                style={{ width: `${50 + ((rowIdx + colIdx) % 4) * 25}px` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Chart skeleton
function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-900 p-6",
        className
      )}
    >
      <Skeleton className="h-5 w-48 bg-zinc-800 mb-1" />
      <Skeleton className="h-3 w-64 bg-zinc-800 mb-6" />
      <div className="flex items-end gap-2 h-48">
        {Array.from({ length: 14 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 bg-zinc-800 rounded-sm"
            style={{ height: `${30 + ((i * 17) % 70)}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// Full-page skeleton combining metric cards + optional chart + table
export function PageSkeleton({
  metricCount = 4,
  showChart = true,
  tableRows = 8,
  tableCols = 5,
}: {
  metricCount?: number
  showChart?: boolean
  tableRows?: number
  tableCols?: number
}) {
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="space-y-1">
        <Skeleton className="h-7 w-48 bg-zinc-800" />
        <Skeleton className="h-4 w-72 bg-zinc-800" />
      </div>

      {/* Metric cards */}
      <MetricCardsSkeleton count={metricCount} />

      {/* Chart */}
      {showChart && <ChartSkeleton />}

      {/* Search input */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-64 bg-zinc-800 rounded-md" />
        <Skeleton className="h-9 w-32 bg-zinc-800 rounded-md" />
      </div>

      {/* Table */}
      <TableSkeleton rows={tableRows} cols={tableCols} />
    </div>
  )
}
