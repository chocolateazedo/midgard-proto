import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getBotsByUserId } from "@/server/queries/bots";

// Modelo não vê dashboard de stats por padrão — vai direto pro bot.
// Gráficos detalhados ficam disponíveis em /dashboard/earnings via menu.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const bots = await getBotsByUserId(session.user.id);
  if (bots.length === 1) {
    redirect(`/dashboard/bots/${bots[0].id}`);
  }
  redirect("/dashboard/bots");
}
