import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Crown } from "lucide-react";

import { auth } from "@/lib/auth";
import { getBotById, getBotSubscribers } from "@/server/queries/bots";
import { ensureManagerOwnsBot } from "@/server/queries/managers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubscribersTable } from "@/app/dashboard/bots/[botId]/subscribers/subscribers-client";

interface PageProps {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function ManagerBotAssinantesPage({ params, searchParams }: PageProps) {
  const { botId } = await params;
  const { page: pageParam } = await searchParams;
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const owns = await ensureManagerOwnsBot(session.user.id, botId);
  if (!owns) notFound();

  const bot = await getBotById(botId);
  if (!bot) notFound();

  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const pageSize = 20;
  const { subscribers, total, totalPages } = await getBotSubscribers(
    botId,
    page,
    pageSize,
    { withActiveSubscription: true }
  );
  const serialized = subscribers.map((s) => ({
    ...s,
    firstSeenAt: s.firstSeenAt ? s.firstSeenAt.toISOString() : null,
    lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="text-slate-500">
        <Link href={`/manager/bots/${botId}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Voltar
        </Link>
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assinantes</h1>
          <p className="text-sm text-slate-400">
            Membros com plano ativo em{" "}
            <span className="text-slate-500">{bot.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white px-3 py-2">
          <Crown className="h-4 w-4 text-purple-600" />
          <span className="text-sm font-medium text-slate-700">{total} ativos</span>
        </div>
      </div>

      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <div className="py-12 text-center">
              <Crown className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Nenhum assinante ativo</p>
              <p className="text-slate-400 text-sm mt-1">
                Membros com planos ativos aparecerão aqui.
              </p>
            </div>
          ) : (
            <>
              <SubscribersTable subscribers={serialized} basePath={`/manager/bots/${botId}`} />
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-slate-400">
                    Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <a href={`?page=${page - 1}`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm">
                        Anterior
                      </a>
                    )}
                    {page < totalPages && (
                      <a href={`?page=${page + 1}`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm">
                        Próxima
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
