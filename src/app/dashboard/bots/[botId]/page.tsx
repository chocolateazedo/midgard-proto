import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Plus, Radio, Settings as SettingsIcon } from "lucide-react";

import { auth } from "@/lib/auth";
import { hasBotSettingsPermission } from "@/lib/bot-permissions";
import { getBotById } from "@/server/queries/bots";
import {
  getUpcomingFeedByBotId,
  getWeeklyEarningsByBotId,
} from "@/server/queries/content";
import { Button } from "@/components/ui/button";
import { UpcomingFeed } from "./upcoming-feed";
import { formatCurrency } from "@/lib/utils";

interface BotOverviewPageProps {
  params: Promise<{ botId: string }>;
}

export default async function BotOverviewPage({ params }: BotOverviewPageProps) {
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

  const [feed, weeklyEarnings] = await Promise.all([
    getUpcomingFeedByBotId(botId),
    getWeeklyEarningsByBotId(botId),
  ]);

  const isOffline = !bot.isActive || !bot.webhookUrl;
  const canAccessSettings = hasBotSettingsPermission(bot, session);

  return (
    <div className="mx-auto max-w-xl space-y-8 py-2">
      {/* Header discreto: nome + engrenagem (só quem pode editar config vê) */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{bot.name}</h1>
        {canAccessSettings && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-slate-500 hover:text-slate-900 hover:bg-slate-50"
            aria-label="Configurações"
          >
            <Link href={`/dashboard/bots/${botId}/settings`}>
              <SettingsIcon className="h-5 w-5" />
            </Link>
          </Button>
        )}
      </div>

      {/* Banner vermelho só quando quebrado */}
      {isOffline && (
        canAccessSettings ? (
          <Link
            href={`/dashboard/bots/${botId}/settings`}
            className="flex items-center justify-between gap-3 rounded-lg bg-red-50 border border-red-200 p-4 hover:bg-red-100 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-red-700">
                Seu bot está offline
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Toque para reconectar
              </p>
            </div>
            <span className="text-red-600">→</span>
          </Link>
        ) : (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm font-medium text-red-700">
              Seu bot está offline
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Peça ao responsável pela sua conta para reativar o bot.
            </p>
          </div>
        )
      )}

      {/* Ganho da semana — uma linha, sem card */}
      <p className="text-center text-sm text-slate-500">
        {weeklyEarnings > 0
          ? `Você ganhou ${formatCurrency(weeklyEarnings)} esta semana`
          : "Você ainda não recebeu esta semana"}
      </p>

      {/* Ação principal */}
      <div className="space-y-3">
        <Button
          asChild
          className="w-full h-16 text-base font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-xl shadow-sm"
        >
          <Link href={`/dashboard/bots/${botId}/publish`}>
            <Plus className="mr-2 h-5 w-5" />
            Publicar
          </Link>
        </Button>

        <Button
          asChild
          variant="outline"
          className="w-full h-12 text-sm border-slate-200 bg-white text-slate-700 hover:bg-slate-50 rounded-xl"
        >
          <Link href={`/dashboard/bots/${botId}/live`}>
            <Radio className="mr-2 h-4 w-4 text-red-500" />
            Fazer live
          </Link>
        </Button>
      </div>

      {/* Feed "O que vai sair" — some se vazio */}
      <UpcomingFeed botId={botId} items={feed} />
    </div>
  );
}
