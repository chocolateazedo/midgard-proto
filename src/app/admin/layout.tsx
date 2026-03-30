"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  Bot,
  DollarSign,
  Settings,
} from "lucide-react"
import { Sidebar } from "@/components/shared/sidebar"
import { Header } from "@/components/shared/header"
import type { SidebarItem } from "@/components/shared/sidebar"

const sidebarItems: SidebarItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Usuários",
    href: "/admin/users",
    icon: Users,
  },
  {
    label: "Bots",
    href: "/admin/bots",
    icon: Bot,
  },
  {
    label: "Receita",
    href: "/admin/earnings",
    icon: DollarSign,
  },
  {
    label: "Configurações",
    href: "/admin/settings",
    icon: Settings,
  },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        items={sidebarItems}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <Header onMobileMenuToggle={() => setMobileOpen((prev) => !prev)} />

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
