import { redirect, notFound } from "next/navigation";
import { Plus } from "lucide-react";

import { auth } from "@/lib/auth";
import { getBotById } from "@/server/queries/bots";
import { getContentByBotId } from "@/server/queries/content";
import { Button } from "@/components/ui/button";
import { ContentGrid } from "./content-grid";

interface ContentPageProps {
  params: Promise<{ botId: string }>;
}

export default async function ContentPage({ params }: ContentPageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const bot = await getBotById(botId);
  if (!bot) notFound();

  const isOwner =
    bot.userId === session.user.id ||
    session.user.role === "owner" ||
    session.user.role === "admin";

  if (!isOwner) redirect("/dashboard/bots");

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
