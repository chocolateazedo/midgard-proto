import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Bot, ExternalLink, Users, DollarSign } from "lucide-react";

import { auth } from "@/lib/auth";
import { getBotsByUserId } from "@/server/queries/bots";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { ToggleBotButton } from "./toggle-bot-button";

export default async function BotsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const bots = await getBotsByUserId(session.user.id);
  const isAdmin = session.user.role === "owner" || session.user.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Meus Bots</h1>
          <p className="text-sm text-slate-400">
            Gerencie seus bots do Telegram
          </p>
        </div>
        {isAdmin && (
          <Button asChild className="bg-primary-600 hover:bg-primary-700 text-white">
            <Link href="/dashboard/bots/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Bot
            </Link>
          </Button>
        )}
      </div>

      {bots.length === 0 ? (
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-600/10">
              <Bot className="h-8 w-8 text-primary-600" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-slate-700">
                Nenhum bot criado ainda
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {isAdmin
                  ? "Crie seu primeiro bot para começar a vender conteúdo"
                  : "Entre em contato com o administrador para criar um bot"}
              </p>
            </div>
            {isAdmin && (
              <Button
                asChild
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                <Link href="/dashboard/bots/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar primeiro bot
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bots.map((bot) => (
            <Card
              key={bot.id}
              className="bg-white border-slate-200/60 rounded-xl text-slate-900 flex flex-col"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100">
                      <Bot className="h-5 w-5 text-primary-600" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base text-slate-900 truncate">
                        {bot.name}
                      </CardTitle>
                      {bot.username && (
                        <p className="text-xs text-slate-400 truncate">
                          @{bot.username}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={bot.isActive ? "default" : "secondary"}
                    className={
                      bot.isActive
                        ? "bg-emerald-100 text-emerald-600 border-emerald-500/30 shrink-0"
                        : "bg-slate-100 text-slate-500 shrink-0"
                    }
                  >
                    {bot.isActive ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pb-4 flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-slate-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      Receita
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(bot.totalRevenue ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                      <Users className="h-3.5 w-3.5" />
                      Assinantes
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {bot.totalSubscribers ?? 0}
                    </p>
                  </div>
                </div>

                {bot.description && (
                  <p className="mt-3 text-xs text-slate-400 line-clamp-2">
                    {bot.description}
                  </p>
                )}
              </CardContent>

              <CardFooter className="gap-2 pt-0 border-t border-slate-200/60 mt-auto">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-slate-700 hover:text-slate-900 hover:bg-slate-50"
                >
                  <Link href={`/dashboard/bots/${bot.id}`}>
                    Gerenciar
                  </Link>
                </Button>

                {bot.username && (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="text-slate-500 hover:text-slate-900 hover:bg-slate-50 px-2"
                  >
                    <a
                      href={`https://t.me/${bot.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}

                <ToggleBotButton botId={bot.id} isActive={bot.isActive ?? false} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
