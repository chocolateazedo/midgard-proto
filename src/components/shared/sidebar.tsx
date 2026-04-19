"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, ChevronLeft, ChevronRight, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
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

export interface SidebarGroup {
  label: string
  icon: LucideIcon
  children: SidebarItem[]
}

export type SidebarEntry = SidebarItem | SidebarGroup

export function isSidebarGroup(entry: SidebarEntry): entry is SidebarGroup {
  return "children" in entry
}

interface SidebarProps {
  items: SidebarEntry[]
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

  // Exact match for root-level items like /dashboard and /admin,
  // prefix match only for deeper paths like /dashboard/bots
  const isRootSection =
    item.href === "/dashboard" || item.href === "/admin"
  const isActive = isRootSection
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/")

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-primary-50 text-primary-700"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
        collapsed && "justify-center px-2"
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

function NavGroup({
  group,
  collapsed,
  onClick,
}: {
  group: SidebarGroup
  collapsed: boolean
  onClick?: () => void
}) {
  const pathname = usePathname()
  const Icon = group.icon
  const isAnyChildActive = group.children.some(
    (child) => pathname === child.href || pathname.startsWith(child.href + "/")
  )
  const [open, setOpen] = React.useState(isAnyChildActive)

  React.useEffect(() => {
    if (isAnyChildActive) setOpen(true)
  }, [isAnyChildActive])

  if (collapsed) {
    // Quando colapsado, mostra apenas o ícone do grupo
    return (
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center justify-center w-full rounded-lg px-2 py-2.5 text-sm font-medium transition-all duration-150",
          isAnyChildActive
            ? "bg-primary-50 text-primary-700"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        )}
        title={group.label}
      >
        <Icon className="h-5 w-5 shrink-0" />
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
          isAnyChildActive
            ? "text-primary-700"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="truncate flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
      </button>
      {open && (
        <div className="ml-4 pl-3 border-l border-slate-200 space-y-0.5 mt-0.5">
          {group.children.map((child) => (
            <NavItem
              key={child.href}
              item={child}
              collapsed={false}
              onClick={onClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarContent({
  items,
  collapsed,
  onCollapsedChange,
  onItemClick,
  showCollapseButton = true,
}: {
  items: SidebarEntry[]
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onItemClick?: () => void
  showCollapseButton?: boolean
}) {
  return (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      {/* Logo */}
      <div
        className={cn(
          "h-16 flex items-center border-b border-slate-100 px-4",
          collapsed ? "justify-center" : "gap-3"
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
          <Zap size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 truncate">BotFans</h1>
            <p className="text-[10px] text-slate-500 truncate">Monetizacao Telegram</p>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {items.map((entry) =>
          isSidebarGroup(entry) ? (
            <NavGroup
              key={entry.label}
              group={entry}
              collapsed={collapsed}
              onClick={onItemClick}
            />
          ) : (
            <NavItem
              key={entry.href}
              item={entry}
              collapsed={collapsed}
              onClick={onItemClick}
            />
          )
        )}
      </nav>

      {/* Collapse toggle */}
      {showCollapseButton && (
        <div className="border-t border-slate-100 p-2">
          <button
            onClick={() => onCollapsedChange(!collapsed)}
            className={cn(
              "w-full flex items-center rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors",
              collapsed ? "justify-center px-2" : "justify-end"
            )}
            title={collapsed ? "Expandir" : "Recolher"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <span className="mr-1 text-xs">Recolher</span>
                <ChevronLeft className="h-4 w-4" />
              </>
            )}
          </button>
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
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col min-h-screen sticky top-0 shrink-0 transition-all duration-200",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        <SidebarContent
          items={items}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
        />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-64 p-0 bg-white border-slate-200">
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
