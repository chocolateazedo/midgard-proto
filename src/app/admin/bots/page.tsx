import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getAllBots } from "@/server/queries/bots"
import { AdminBotsClient } from "./bots-client"

export default async function AdminBotsPage() {
  const session = await auth()
  if (!session?.user || (session.user.role !== "owner" && session.user.role !== "admin")) {
    redirect("/login")
  }

  const bots = await getAllBots()

  return <AdminBotsClient bots={bots} />
}
