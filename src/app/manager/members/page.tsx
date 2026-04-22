import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";
import { UsersRound, Search, Bot } from "lucide-react";

import { auth } from "@/lib/auth";
import { getManagerMembers } from "@/server/queries/managers";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function ManagerMembersPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const { page: pageParam, search } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const { members, total, totalPages } = await getManagerMembers(
    session.user.id,
    page,
    20,
    { search: search || undefined }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Membros</h1>
          <p className="text-sm text-slate-400">
            Usuários Telegram dos seus creators
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white px-3 py-2">
          <UsersRound className="h-4 w-4 text-primary-600" />
          <span className="text-sm font-medium text-slate-700">
            {total} no total
          </span>
        </div>
      </div>

      <form className="max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            name="search"
            defaultValue={search ?? ""}
            placeholder="Buscar por nome ou username..."
            className="pl-9 bg-white border-slate-200"
          />
        </div>
      </form>

      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.length === 0 && (
            <p className="text-center text-slate-400 py-8">Nenhum membro.</p>
          )}
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-4 rounded-lg border border-slate-200/60 p-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 shrink-0">
                <span className="text-sm font-bold text-primary-600">
                  {(m.telegramFirstName ?? "?")[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {m.telegramFirstName ?? "Usuário"}
                  </p>
                  {m.telegramUsername && (
                    <span className="text-xs text-primary-600">@{m.telegramUsername}</span>
                  )}
                  {m.activePlanName && (
                    <Badge className="bg-purple-100 text-purple-700 text-xs">
                      {m.activePlanName}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                  <span>Primeiro: {formatDate(new Date(m.firstSeenAt))}</span>
                  <span>·</span>
                  <span>Último: {formatDate(new Date(m.lastSeenAt))}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <Bot className="h-3.5 w-3.5 text-slate-400" />
                  {m.bots.map((b) => (
                    <Badge
                      key={b.id}
                      variant="secondary"
                      className="bg-slate-100 text-slate-600 text-xs"
                    >
                      {b.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-emerald-600">
                  {formatCurrency(m.totalSpent)}
                </p>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="pt-4 flex items-center justify-between">
              <p className="text-sm text-slate-400">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`?page=${page - 1}${search ? `&search=${search}` : ""}`}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Anterior
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`?page=${page + 1}${search ? `&search=${search}` : ""}`}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Próxima
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
