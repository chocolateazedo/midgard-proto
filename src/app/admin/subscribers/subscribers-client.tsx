"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UsersRound, Search, Bot } from "lucide-react";
import type { PlatformSubscriber } from "@/server/queries/bots";

interface PlatformSubscribersClientProps {
  subscribers: PlatformSubscriber[];
  total: number;
  page: number;
  totalPages: number;
  currentSearch: string;
}

export function PlatformSubscribersClient({
  subscribers,
  total,
  page,
  totalPages,
  currentSearch,
}: PlatformSubscribersClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState(currentSearch);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    router.push(`/admin/subscribers?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assinantes</h1>
          <p className="text-sm text-slate-400">
            Todos os usuários do Telegram registrados na plataforma
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white px-3 py-2">
          <UsersRound className="h-4 w-4 text-primary-600" />
          <span className="text-sm font-medium text-slate-700">
            {total} no total
          </span>
        </div>
      </div>

      {/* Busca */}
      <form onSubmit={handleSearch} className="max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou username..."
            className="pl-9 bg-white border-slate-200 text-slate-900 placeholder-slate-400"
          />
        </div>
      </form>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">
            Lista de Assinantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UsersRound className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">
                Nenhum assinante encontrado
              </p>
              <p className="text-slate-400 text-sm mt-1">
                Quando usuários interagirem com os bots, aparecerão aqui
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {subscribers.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-4 rounded-lg border border-slate-200/60 p-4 hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Avatar placeholder */}
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 shrink-0">
                      <span className="text-sm font-bold text-primary-600">
                        {(sub.telegramFirstName ?? "?")[0].toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {sub.telegramFirstName ?? "Usuário"}
                        </p>
                        {sub.telegramUsername && (
                          <span className="text-xs text-primary-600">
                            @{sub.telegramUsername}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-400">
                          ID: {sub.telegramUserId}
                        </span>
                        <span className="text-xs text-slate-300">•</span>
                        <span className="text-xs text-slate-400">
                          Primeiro acesso: {formatDate(new Date(sub.firstSeenAt))}
                        </span>
                        <span className="text-xs text-slate-300">•</span>
                        <span className="text-xs text-slate-400">
                          Último: {formatDate(new Date(sub.lastSeenAt))}
                        </span>
                      </div>

                      {/* Bots associados */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <Bot className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        {sub.bots.map((bot) => (
                          <Badge
                            key={bot.id}
                            variant="secondary"
                            className="bg-slate-100 text-slate-600 text-xs px-2 py-0"
                          >
                            {bot.name}
                            {bot.username && (
                              <span className="text-slate-400 ml-1">@{bot.username}</span>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Total gasto */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-emerald-600">
                        {formatCurrency(sub.totalSpent)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {sub.bots.length} bot{sub.bots.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-slate-400">
                    Página {page} de {totalPages} ({total} registros)
                  </p>
                  <div className="flex items-center gap-2">
                    {page > 1 && (
                      <a
                        href={`?page=${page - 1}${currentSearch ? `&search=${currentSearch}` : ""}`}
                        className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        Anterior
                      </a>
                    )}
                    {page < totalPages && (
                      <a
                        href={`?page=${page + 1}${currentSearch ? `&search=${currentSearch}` : ""}`}
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
