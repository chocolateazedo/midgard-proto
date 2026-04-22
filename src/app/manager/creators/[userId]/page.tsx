import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, DollarSign } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureManagerOwnsCreator } from "@/server/queries/managers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function ManagerCreatorDetailPage({ params }: PageProps) {
  const { userId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const owns = await ensureManagerOwnsCreator(session.user.id, userId);
  if (!owns) notFound();

  const creator = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      managerFeePercent: true,
      createdAt: true,
      bots: {
        select: {
          id: true,
          name: true,
          username: true,
          isActive: true,
          totalSubscribers: true,
        },
      },
    },
  });
  if (!creator) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="text-slate-500">
        <Link href="/manager/creators">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Voltar
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{creator.name}</h1>
          <p className="text-sm text-slate-500 mt-1">{creator.email}</p>
        </div>
        <Badge
          className={
            creator.isActive
              ? "bg-emerald-100 text-emerald-600"
              : "bg-slate-100 text-slate-500"
          }
        >
          {creator.isActive ? "Ativo" : "Inativo"}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="bg-white border-slate-200/60 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-600" />
              Sua taxa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-bold text-amber-700">
              {creator.managerFeePercent?.toFixed(1) ?? "—"}%
            </p>
            <p className="text-xs text-slate-400">
              Definida pelo administrador. Fale com um admin para alterar.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary-600" />
              Bots ({creator.bots.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {creator.bots.length === 0 && (
              <p className="text-sm text-slate-400">Este creator ainda não tem bot.</p>
            )}
            {creator.bots.map((bot) => (
              <Link
                key={bot.id}
                href={`/manager/bots/${bot.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/60 p-3 hover:bg-slate-50 transition"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{bot.name}</p>
                  <p className="text-xs text-slate-400">
                    {bot.username ? `@${bot.username}` : "—"} · {bot.totalSubscribers ?? 0} membros
                  </p>
                </div>
                <Badge
                  className={
                    bot.isActive
                      ? "bg-emerald-100 text-emerald-600 text-xs"
                      : "bg-slate-100 text-slate-500 text-xs"
                  }
                >
                  {bot.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-slate-400">
        Cadastrado em {formatDate(creator.createdAt)}
      </p>
    </div>
  );
}
