import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getPlatformEarnings, getDailyEarnings, getTopCreators, getTopBots } from "@/server/queries/earnings"
import { AdminEarningsClient } from "./earnings-client"

interface EarningsPageProps {
  searchParams: Promise<{
    period?: string
    from?: string
    to?: string
  }>
}

export default async function AdminEarningsPage({ searchParams }: EarningsPageProps) {
  const session = await auth()
  if (!session?.user || (session.user.role !== "owner" && session.user.role !== "admin")) {
    redirect("/login")
  }

  const params = await searchParams
  const period = params.period ?? "30d"

  const now = new Date()
  let startDate: Date

  if (period === "7d") {
    startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 7)
  } else if (period === "90d") {
    startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 90)
  } else if (period === "custom" && params.from && params.to) {
    startDate = new Date(params.from)
  } else {
    // default 30d
    startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 30)
  }

  const endDate =
    period === "custom" && params.to ? new Date(params.to) : now

  const allPurchases = await getPlatformEarnings(startDate, endDate)
  const dailyData = await getDailyEarnings(null, startDate, endDate)
  const topCreators = await getTopCreators(50)
  const topBots = await getTopBots(50)

  return (
    <AdminEarningsClient
      purchases={allPurchases}
      dailyData={dailyData}
      topCreators={topCreators}
      topBots={topBots}
      period={period}
      fromDate={params.from ?? ""}
      toDate={params.to ?? ""}
    />
  )
}
