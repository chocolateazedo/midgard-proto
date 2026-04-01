import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { getBotById } from "@/server/queries/bots";
import { getContentByBotId } from "@/server/queries/content";
import { ContentGrid } from "@/app/dashboard/bots/[botId]/content/content-grid";

interface ContentPageProps {
  params: Promise<{ botId: string }>;
}

export default async function AdminContentPage({ params }: ContentPageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (session.user.role !== "owner" && session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const bot = await getBotById(botId);
  if (!bot) notFound();

  const contentList = await getContentByBotId(botId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Conteúdo</h1>
          <p className="text-sm text-slate-400">
            Gerencie o conteúdo do bot{" "}
            <span className="text-slate-500">{bot.name}</span>
          </p>
        </div>
      </div>

      <ContentGrid botId={botId} initialContent={contentList} />
    </div>
  );
}
