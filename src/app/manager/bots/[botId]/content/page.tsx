import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { getBotById } from "@/server/queries/bots";
import { ensureManagerOwnsBot } from "@/server/queries/managers";
import { Button } from "@/components/ui/button";
import { ContentManager } from "@/app/dashboard/bots/[botId]/content/content-manager";

interface PageProps {
  params: Promise<{ botId: string }>;
}

export default async function ManagerContentPage({ params }: PageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const owns = await ensureManagerOwnsBot(session.user.id, botId);
  if (!owns) notFound();

  const bot = await getBotById(botId);
  if (!bot) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="text-slate-500">
        <Link href={`/manager/bots/${botId}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Voltar
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Conteúdo</h1>
        <p className="text-sm text-slate-400">
          {bot.name} {bot.username && `(@${bot.username})`}
        </p>
      </div>

      <ContentManager botId={botId} basePath="/manager/bots" />
    </div>
  );
}
