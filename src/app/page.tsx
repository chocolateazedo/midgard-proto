import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getBotsByUserId } from "@/server/queries/bots"

export default async function HomePage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  if (session.user.role === "owner" || session.user.role === "admin") {
    redirect("/admin")
  }

  // Creator (modelo): pula o dashboard de stats e vai direto pro bot.
  // Se tem 1 bot só → home simplificada do bot; se vários → seletor.
  const bots = await getBotsByUserId(session.user.id)
  if (bots.length === 1) {
    redirect(`/dashboard/bots/${bots[0].id}`)
  }
  redirect("/dashboard/bots")
}
