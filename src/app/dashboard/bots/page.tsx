import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, ChevronRight } from "lucide-react";

import { auth } from "@/lib/auth";
import { getBotsByUserId } from "@/server/queries/bots";

export default async function BotsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const bots = await getBotsByUserId(session.user.id);
  const isAdmin =
    session.user.role === "owner" || session.user.role === "admin";

  if (bots.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">Seus bots</h1>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 mb-4">
            <Bot className="h-7 w-7 text-primary-600" />
          </div>
          <p className="text-base font-medium text-slate-800">
            Nenhum bot ainda
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? "Crie um bot para começar."
              : "Fale com quem te cadastrou pra criar seu bot."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Escolha um bot</h1>

      <div className="space-y-2">
        {bots.map((bot) => (
          <Link
            key={bot.id}
            href={`/dashboard/bots/${bot.id}`}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50">
              <Bot className="h-6 w-6 text-primary-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-slate-900 truncate">
                {bot.name}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {bot.username ? `@${bot.username}` : "Sem username"}
                {!bot.isActive && " · Inativo"}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
