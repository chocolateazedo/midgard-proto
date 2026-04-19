"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Bot,
  DollarSign,
  Menu,
  Settings,
  LogOut,
  Zap,
} from "lucide-react";

import { AccountStatusBanner } from "@/components/shared/account-status-banner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const menuItems: MenuItem[] = [
  { href: "/dashboard/bots", label: "Meus bots", icon: Bot },
  { href: "/dashboard/earnings", label: "Ganhos", icon: DollarSign },
  { href: "/dashboard/settings", label: "Minha conta", icon: Settings },
];

function MenuLink({
  item,
  onClick,
}: {
  item: MenuItem;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active =
    pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
        active
          ? "bg-primary-50 text-primary-700"
          : "text-slate-700 hover:bg-slate-50"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const userEmail = session?.user?.email ?? "";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header fino: só o menu à esquerda; sem saudação/stats pra modelo */}
      <header className="bg-white border-b border-slate-200/60 sticky top-0 z-40">
        <div className="px-4 h-14 flex items-center">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <AccountStatusBanner />

      <main className="px-4 py-6 md:py-8 max-w-2xl mx-auto w-full">
        {children}
      </main>

      {/* Menu lateral sob demanda (nunca permanente) */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0 bg-white border-slate-200 flex flex-col"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          {/* Identidade do usuário */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                <Zap size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {userName || "BotFans"}
                </p>
                {userEmail && (
                  <p className="text-xs text-slate-400 truncate">
                    {userEmail}
                  </p>
                )}
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
            {menuItems.map((item) => (
              <MenuLink
                key={item.href}
                item={item}
                onClick={() => setMenuOpen(false)}
              />
            ))}
          </nav>

          <div className="border-t border-slate-100 p-2">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span>Sair</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
