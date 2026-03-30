"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Menu, ChevronRight, LogOut, Settings, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface HeaderProps {
  onMobileMenuToggle: () => void
}

function buildBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split("/").filter(Boolean)
  const crumbs: { label: string; href: string }[] = []

  const labelMap: Record<string, string> = {
    dashboard: "Dashboard",
    admin: "Admin",
    bots: "Bots",
    content: "Conteúdo",
    subscribers: "Assinantes",
    settings: "Configurações",
    earnings: "Ganhos",
    users: "Usuários",
    new: "Novo",
    storage: "Storage",
    telegram: "Telegram",
  }

  let accumulatedPath = ""
  for (const segment of segments) {
    accumulatedPath += `/${segment}`
    // Check if it's a UUID — treat it as a dynamic ID
    const isId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        segment
      )
    const label = isId ? "Detalhes" : (labelMap[segment] ?? segment)
    crumbs.push({ label, href: accumulatedPath })
  }

  return crumbs
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const breadcrumbs = buildBreadcrumbs(pathname)

  const userName = session?.user?.name ?? "Usuário"
  const userEmail = session?.user?.email ?? ""
  const userImage = session?.user?.image ?? null

  // Determine settings path based on current section
  const isAdmin = pathname.startsWith("/admin")
  const settingsPath = isAdmin ? "/admin/settings" : "/dashboard/settings"

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur px-4 md:px-6">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden text-zinc-400 hover:text-white hover:bg-zinc-800"
        onClick={onMobileMenuToggle}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Breadcrumbs */}
      <nav className="flex-1 flex items-center gap-1 text-sm overflow-hidden">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1
          return (
            <React.Fragment key={crumb.href}>
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              )}
              {isLast ? (
                <span className="font-medium text-zinc-100 truncate">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors truncate"
                >
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          )
        })}
      </nav>

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-2 px-2 text-zinc-300 hover:text-white hover:bg-zinc-800 h-auto py-1.5"
          >
            <Avatar className="h-8 w-8">
              {userImage && <AvatarImage src={userImage} alt={userName} />}
              <AvatarFallback className="bg-violet-600 text-white text-xs">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">
              {userName}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 bg-zinc-900 border-zinc-800 text-zinc-100"
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium leading-none">{userName}</p>
              <p className="text-xs leading-none text-zinc-400">{userEmail}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem asChild className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800">
            <Link href="/dashboard/settings" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>Perfil</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800">
            <Link href={settingsPath} className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>Configurações</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem
            className="cursor-pointer text-red-400 hover:text-red-300 hover:bg-zinc-800 focus:bg-zinc-800 focus:text-red-300"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4 mr-2" />
            <span>Sair</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
