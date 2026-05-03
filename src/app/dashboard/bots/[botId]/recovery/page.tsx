import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { hasBotManagePermission } from "@/lib/bot-permissions";
import { getBotById } from "@/server/queries/bots";
import { Button } from "@/components/ui/button";

import { RecoveryClient } from "./recovery-client";

interface PageProps {
  params: Promise<{ botId: string }>;
}

export default async function RecoveryPage({ params }: PageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const bot = await getBotById(botId);
  if (!bot) notFound();
  if (!hasBotManagePermission(bot, session)) redirect("/dashboard/bots");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-slate-500 hover:text-slate-900 hover:bg-slate-50"
        >
          <Link href={`/dashboard/bots/${botId}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Configuração de Mensagens
        </h1>
        <p className="text-sm text-slate-400">
          Fluxos automáticos de mensagens pro bot{" "}
          <span className="text-slate-500">{bot.name}</span>.
        </p>
      </div>

      <RecoveryClient botId={botId} />
    </div>
  );
}
