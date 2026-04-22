import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Bot,
  DollarSign,
  Users,
  FileImage,
  ExternalLink,
  Settings,
  Image as ImageIcon,
  Activity,
  Upload,
  ArrowLeft,
  Crown,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { getBotById } from "@/server/queries/bots";
import { ensureManagerOwnsBot } from "@/server/queries/managers";
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
import { CopyButton } from "@/app/dashboard/bots/[botId]/copy-button";

interface PageProps {
  params: Promise<{ botId: string }>;
}

export default async function ManagerBotOverviewPage({ params }: PageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const owns = await ensureManagerOwnsBot(session.user.id, botId);
  if (!owns) notFound();

  const bot = await getBotById(botId);
  if (!bot) notFound();

  const botLink = bot.username ? `https://t.me/${bot.username}` : null;
  const basePath = `/manager/bots/${botId}`;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="text-slate-500">
        <Link href="/manager/bots">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Voltar
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary-100 flex items-center justify-center">
            <Bot className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{bot.name}</h1>
              <Badge
                className={
                  bot.isActive
                    ? "bg-emerald-100 text-emerald-600 border-emerald-500/30"
                    : "bg-slate-100 text-slate-500"
                }
              >
                {bot.isActive ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            {bot.username && <p className="text-sm text-slate-400">@{bot.username}</p>}
            <p className="text-xs text-slate-400 mt-1">
              Creator: {bot.user.name} ({bot.user.email})
            </p>
          </div>
        </div>
      </div>

      {botLink && (
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <Activity className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-slate-400">Link do Bot</p>
                <p className="text-sm font-mono text-slate-700 truncate">{botLink}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <CopyButton text={botLink} />
              <a href={botLink} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-500 hover:text-slate-900">
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Receita Total"
          value={formatCurrency(bot.totalRevenue ?? 0)}
          icon={DollarSign}
          iconClassName="bg-emerald-100 text-emerald-600"
        />
        <MetricCard
          title="Membros"
          value={String(bot.totalSubscribers ?? 0)}
          icon={Users}
          iconClassName="bg-blue-100 text-blue-600"
        />
        <MetricCard
          title="Conteúdos"
          value="—"
          icon={FileImage}
          iconClassName="bg-primary-100 text-primary-600"
        />
      </div>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Ações Rápidas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Button asChild variant="outline" className="h-auto flex-col gap-2 py-4">
            <Link href={`${basePath}/publish`}>
              <Upload className="h-5 w-5 text-primary-600" />
              <span className="text-sm font-medium">Publicar</span>
              <span className="text-xs text-slate-400">Catálogo ou avulso</span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-2 py-4">
            <Link href={`${basePath}/content`}>
              <ImageIcon className="h-5 w-5 text-primary-600" />
              <span className="text-sm font-medium">Conteúdo</span>
              <span className="text-xs text-slate-400">Lista e edição</span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-2 py-4">
            <Link href={`${basePath}/subscribers`}>
              <Users className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">Membros</span>
              <span className="text-xs text-slate-400">Todos do bot</span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-2 py-4">
            <Link href={`${basePath}/assinantes`}>
              <Crown className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium">Assinantes</span>
              <span className="text-xs text-slate-400">Só com plano ativo</span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-2 py-4">
            <Link href={`${basePath}/settings`}>
              <Settings className="h-5 w-5 text-slate-500" />
              <span className="text-sm font-medium">Configurações</span>
              <span className="text-xs text-slate-400">Planos, canal, geral</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
