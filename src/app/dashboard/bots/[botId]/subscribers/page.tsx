import { redirect, notFound } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { auth } from "@/lib/auth";
import { getBotById, getBotSubscribers } from "@/server/queries/bots";
import { DataTable } from "@/components/shared/data-table";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users } from "lucide-react";

interface SubscribersPageProps {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ page?: string }>;
}

type SubscriberRow = {
  id: string;
  botId: string;
  telegramUserId: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  totalSpent: string;
};

const columns: ColumnDef<SubscriberRow>[] = [
  {
    accessorKey: "telegramFirstName",
    header: "Nome",
    cell: ({ row }) => (
      <span className="text-zinc-200">
        {row.original.telegramFirstName ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "telegramUsername",
    header: "Username",
    cell: ({ row }) =>
      row.original.telegramUsername ? (
        <span className="text-violet-400">@{row.original.telegramUsername}</span>
      ) : (
        <span className="text-zinc-600">—</span>
      ),
  },
  {
    accessorKey: "firstSeenAt",
    header: "Primeiro Acesso",
    cell: ({ row }) => (
      <span className="text-zinc-400 text-sm">
        {row.original.firstSeenAt ? formatDate(row.original.firstSeenAt) : "—"}
      </span>
    ),
  },
  {
    accessorKey: "lastSeenAt",
    header: "Último Acesso",
    cell: ({ row }) => (
      <span className="text-zinc-400 text-sm">
        {row.original.lastSeenAt ? formatDate(row.original.lastSeenAt) : "—"}
      </span>
    ),
  },
  {
    accessorKey: "totalSpent",
    header: "Total Gasto",
    cell: ({ row }) => (
      <span className="font-medium text-emerald-400">
        {formatCurrency(parseFloat(row.original.totalSpent))}
      </span>
    ),
  },
];

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Assinantes</h1>
          <p className="text-sm text-zinc-500">
            Usuários do Telegram que interagiram com{" "}
            <span className="text-zinc-400">{bot.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
          <Users className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-zinc-300">
            {total} no total
          </span>
        </div>
      </div>

      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="text-base text-zinc-100">
            Lista de Assinantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-zinc-700 mb-3" />
              <p className="text-zinc-400 font-medium">
                Nenhum assinante ainda
              </p>
              <p className="text-zinc-600 text-sm mt-1">
                Quando usuários iniciarem seu bot, aparecerão aqui
              </p>
            </div>
          ) : (
            <>
              <DataTable
                columns={columns}
                data={subscribers}
                searchKey="telegramFirstName"
                pagination={false}
              />

              {/* Server-side pagination controls */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-zinc-500">
                    Página {page} de {totalPages} ({total} registros)
                  </p>
                  <div className="flex items-center gap-2">
                    {page > 1 && (
                      <a
                        href={`?page=${page - 1}`}
                        className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                      >
                        Anterior
                      </a>
                    )}
                    {page < totalPages && (
                      <a
                        href={`?page=${page + 1}`}
                        className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
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
