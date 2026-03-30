import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Bot,
  DollarSign,
  Users,
  FileImage,
  ShoppingCart,
  ExternalLink,
  Copy,
  Settings,
  Image as ImageIcon,
  Activity,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { getBotById } from "@/server/queries/bots";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { CopyButton } from "./copy-button";

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

  const botLink = bot.username ? `https://t.me/${bot.username}` : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/20">
            <Bot className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-100">{bot.name}</h1>
              <Badge
                variant={bot.isActive ? "default" : "secondary"}
                className={
                  bot.isActive
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-zinc-700 text-zinc-400"
                }
              >
                {bot.isActive ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            {bot.username && (
              <p className="text-sm text-zinc-500">@{bot.username}</p>
            )}
          </div>
        </div>

        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Link href={`/dashboard/bots/${botId}/settings`}>
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </Link>
        </Button>
      </div>

      {/* Bot Link */}
      {botLink && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <Activity className="h-4 w-4 text-zinc-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-zinc-500">Link do Bot</p>
                <p className="text-sm font-mono text-zinc-300 truncate">
                  {botLink}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <CopyButton text={botLink} />
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <a href={botLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhook Status */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                bot.isActive && bot.webhookUrl
                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                  : "bg-zinc-600"
              }`}
            />
            <div>
              <p className="text-sm text-zinc-300">Webhook</p>
              <p className="text-xs text-zinc-500">
                {bot.isActive && bot.webhookUrl
                  ? "Conectado e recebendo mensagens"
                  : "Webhook inativo"}
              </p>
            </div>
          </div>
          {(!bot.isActive || !bot.webhookUrl) && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 text-xs"
            >
              <Link href={`/dashboard/bots/${botId}/settings`}>
                Reativar Webhook
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Receita Total"
          value={formatCurrency(bot.totalRevenue ?? 0)}
          icon={DollarSign}
          iconClassName="bg-emerald-500/20 text-emerald-400"
        />
        <MetricCard
          title="Assinantes"
          value={String(bot.totalSubscribers ?? 0)}
          icon={Users}
          iconClassName="bg-blue-500/20 text-blue-400"
        />
        <MetricCard
          title="Vendas"
          value="—"
          icon={ShoppingCart}
          iconClassName="bg-amber-500/20 text-amber-400"
        />
        <MetricCard
          title="Conteúdos"
          value="—"
          icon={FileImage}
          iconClassName="bg-violet-500/20 text-violet-400"
        />
      </div>

      {/* Quick Actions */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="text-base text-zinc-100">
            Ações Rápidas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button
            asChild
            variant="outline"
            className="h-auto flex-col gap-2 py-4 border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 hover:border-violet-500/50"
          >
            <Link href={`/dashboard/bots/${botId}/content`}>
              <ImageIcon className="h-5 w-5 text-violet-400" />
              <span className="text-sm font-medium">Gerenciar Conteúdo</span>
              <span className="text-xs text-zinc-500">
                Adicionar e publicar conteúdo
              </span>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-auto flex-col gap-2 py-4 border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 hover:border-violet-500/50"
          >
            <Link href={`/dashboard/bots/${botId}/subscribers`}>
              <Users className="h-5 w-5 text-blue-400" />
              <span className="text-sm font-medium">Ver Assinantes</span>
              <span className="text-xs text-zinc-500">
                Usuários do Telegram
              </span>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-auto flex-col gap-2 py-4 border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 hover:border-violet-500/50"
          >
            <Link href={`/dashboard/bots/${botId}/settings`}>
              <Settings className="h-5 w-5 text-zinc-400" />
              <span className="text-sm font-medium">Configurações</span>
              <span className="text-xs text-zinc-500">
                Editar token, mensagem e mais
              </span>
            </Link>
          </Button>
        </CardContent>
      </Card>

      {bot.description && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-base text-zinc-100">Descrição</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">{bot.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
