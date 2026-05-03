import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { getBotById } from "@/server/queries/bots";
import { Button } from "@/components/ui/button";

import { BackupClient } from "@/app/dashboard/bots/[botId]/backup/backup-client";

interface BackupPageProps {
  params: Promise<{ botId: string }>;
}

export default async function AdminBackupPage({ params }: BackupPageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (session.user.role !== "owner" && session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const bot = await getBotById(botId);
  if (!bot) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-slate-500 hover:text-slate-900 hover:bg-slate-50"
        >
          <Link href={`/admin/bots/${botId}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Backup do Canal</h1>
        <p className="text-sm text-slate-400">
          Bot{" "}
          <span className="text-slate-500">{bot.name}</span>
          {" — "}
          Creator:{" "}
          <span className="text-slate-500">{bot.user.name}</span>
        </p>
      </div>

      <BackupClient botId={botId} hasChannel={!!bot.channelId} />
    </div>
  );
}
