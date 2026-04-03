import { redirect, notFound } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { getBotById, getBotSubscribers } from "@/server/queries/bots";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
import { SubscribersTable } from "./subscribers-client";

interface SubscribersPageProps {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function SubscribersPage({
  params,
  searchParams,
}: SubscribersPageProps) {
  const { botId } = await params;
  const { page: pageParam } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const bot = await getBotById(botId);
  if (!bot) notFound();

  const isOwner =
    bot.userId === session.user.id ||
    session.user.role === "owner" ||
    session.user.role === "admin";

  if (!isOwner) redirect("/dashboard/bots");

  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const pageSize = 20;

  const { subscribers, total, totalPages } = await getBotSubscribers(
    botId,
    page,
    pageSize
  );

  // Serialize dates to strings for client component
  const serializedSubscribers = subscribers.map((s) => ({
    ...s,
    firstSeenAt: s.firstSeenAt ? s.firstSeenAt.toISOString() : null,
    lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
  }));

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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assinantes</h1>
          <p className="text-sm text-slate-400">
            Usuários do Telegram que interagiram com{" "}
            <span className="text-slate-500">{bot.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white px-3 py-2">
          <Users className="h-4 w-4 text-primary-600" />
          <span className="text-sm font-medium text-slate-700">
            {total} no total
          </span>
        </div>
      </div>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">
            Lista de Assinantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">
                Nenhum assinante ainda
              </p>
              <p className="text-slate-400 text-sm mt-1">
                Quando usuários iniciarem seu bot, aparecerão aqui
              </p>
            </div>
          ) : (
            <>
              <SubscribersTable subscribers={serializedSubscribers} />

              {/* Server-side pagination controls */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-slate-400">
                    Página {page} de {totalPages} ({total} registros)
                  </p>
                  <div className="flex items-center gap-2">
                    {page > 1 && (
                      <a
                        href={`?page=${page - 1}`}
                        className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        Anterior
                      </a>
                    )}
                    {page < totalPages && (
                      <a
                        href={`?page=${page + 1}`}
                        className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
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
