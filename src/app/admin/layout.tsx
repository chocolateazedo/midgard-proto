"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  UsersRound,
  ClipboardCheck,
  Bot,
  DollarSign,
  TrendingUp,
  Settings,
} from "lucide-react"
import { Sidebar } from "@/components/shared/sidebar"
import { Header } from "@/components/shared/header"
import type { SidebarItem } from "@/components/shared/sidebar"

const sidebarItems: SidebarItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Usuarios", href: "/admin/users", icon: Users },
  { label: "Pendentes", href: "/admin/pending", icon: ClipboardCheck },
  { label: "Assinantes", href: "/admin/subscribers", icon: UsersRound },
  { label: "Bots", href: "/admin/bots", icon: Bot },
  { label: "Top Conteúdos", href: "/admin/top-content", icon: TrendingUp },
  { label: "Receita", href: "/admin/earnings", icon: DollarSign },
  { label: "Configuracoes", href: "/admin/settings", icon: Settings },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        items={sidebarItems}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMobileMenuToggle={() => setMobileOpen((prev) => !prev)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
