import { redirect } from "next/navigation";
import Link from "next/link";
import { Bot, ExternalLink } from "lucide-react";

import { auth } from "@/lib/auth";
import { getManagerBots } from "@/server/queries/managers";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export default async function ManagerBotsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const bots = await getManagerBots(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bots</h1>
        <p className="text-sm text-slate-500 mt-1">
          {bots.length} bot(s) dos seus creators
        </p>
      </div>

      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bots.length === 0 && (
            <div className="py-12 text-center">
              <Bot className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Nenhum bot ainda.</p>
              <p className="text-xs text-slate-400 mt-1">
                Crie um creator em Creators → Novo Creator.
              </p>
            </div>
          )}
          {bots.map((bot) => (
            <Link
              key={bot.id}
              href={`/manager/bots/${bot.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200/60 p-4 hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {bot.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {bot.username ? `@${bot.username}` : "—"} · Creator: {bot.user.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge
                  className={
                    bot.isActive
                      ? "bg-emerald-100 text-emerald-600 text-xs"
                      : "bg-slate-100 text-slate-500 text-xs"
                  }
                >
                  {bot.isActive ? "Ativo" : "Inativo"}
                </Badge>
                <span className="text-sm font-semibold text-emerald-600">
                  {formatCurrency(bot.totalRevenue)}
                </span>
                <ExternalLink className="h-4 w-4 text-slate-300" />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
