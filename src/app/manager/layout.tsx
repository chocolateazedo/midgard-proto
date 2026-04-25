"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Bot,
  DollarSign,
  Crown,
} from "lucide-react"
import { Sidebar } from "@/components/shared/sidebar"
import { Header } from "@/components/shared/header"
import type { SidebarEntry } from "@/components/shared/sidebar"

const sidebarItems: SidebarEntry[] = [
  { label: "Dashboard", href: "/manager", icon: LayoutDashboard },
  { label: "Creators", href: "/manager/creators", icon: Users },
  { label: "Bots", href: "/manager/bots", icon: Bot },
  { label: "Seguidores", href: "/manager/members", icon: UsersRound },
  { label: "Assinantes", href: "/manager/assinantes", icon: Crown },
  { label: "Receita", href: "/manager/earnings", icon: DollarSign },
]

export default function ManagerLayout({
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
