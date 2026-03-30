"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { LucideIcon } from "lucide-react"

export interface SidebarItem {
  label: string
  href: string
  icon: LucideIcon
}

interface SidebarProps {
  items: SidebarItem[]
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  mobileOpen?: boolean
  onMobileOpenChange?: (open: boolean) => void
}

function NavItem({
  item,
  collapsed,
  onClick,
}: {
  item: SidebarItem
  collapsed: boolean
  onClick?: () => void
}) {
  const pathname = usePathname()
  const Icon = item.icon

  // Active if exact match or the pathname starts with the href (but not just "/")
  const isActive =
    pathname === item.href ||
    (item.href !== "/" && pathname.startsWith(item.href + "/")) ||
    (item.href !== "/" && pathname.startsWith(item.href))

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
        "hover:bg-zinc-800 hover:text-white",
        isActive
          ? "bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 hover:text-violet-300"
          : "text-zinc-400",
        collapsed && "justify-center px-2"
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

function SidebarContent({
  items,
  collapsed,
  onCollapsedChange,
  onItemClick,
  showCollapseButton = true,
}: {
  items: SidebarItem[]
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onItemClick?: () => void
  showCollapseButton?: boolean
}) {
  return (
    <div className="flex h-full flex-col bg-zinc-950 border-r border-zinc-800">
      {/* Logo / Brand */}
      <div
        className={cn(
          "flex items-center border-b border-zinc-800 px-4 py-4",
          collapsed ? "justify-center" : "gap-2"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-white">
            BotFlow
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {items.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            collapsed={collapsed}
            onClick={onItemClick}
          />
        ))}
      </nav>

      {/* Collapse toggle */}
      {showCollapseButton && (
        <div className="border-t border-zinc-800 p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapsedChange(!collapsed)}
            className={cn(
              "w-full text-zinc-400 hover:bg-zinc-800 hover:text-white",
              collapsed ? "justify-center px-2" : "justify-end"
            )}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <span className="mr-1 text-xs">Recolher</span>
                <ChevronLeft className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

export function Sidebar({
  items,
  collapsed,
  onCollapsedChange,
  mobileOpen = false,
  onMobileOpenChange,
}: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside
        className={cn(
          "hidden md:flex flex-col h-screen sticky top-0 shrink-0 transition-all duration-300",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarContent
          items={items}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
        />
      </aside>

      {/* Mobile sidebar — Sheet/Drawer overlay */}
      <Sheet
        open={mobileOpen}
        onOpenChange={onMobileOpenChange}
      >
        <SheetContent side="left" className="w-60 p-0 bg-zinc-950 border-zinc-800">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent
            items={items}
            collapsed={false}
            onCollapsedChange={() => {}}
            onItemClick={() => onMobileOpenChange?.(false)}
            showCollapseButton={false}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
