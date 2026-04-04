"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ExternalLink, Plus, Power, PowerOff } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatDate } from "@/lib/utils"
import { toggleBot } from "@/server/actions/bot.actions"

type BotRow = {
  id: string
  name: string
  username: string | null
  isActive: boolean | null
  totalRevenue: number | null
  totalSubscribers: number | null
  createdAt: Date | null
  user: {
    id: string
    name: string
    email: string
    role: "owner" | "admin" | "creator"
  }
}

interface AdminBotsClientProps {
  bots: BotRow[]
}

export function AdminBotsClient({ bots }: AdminBotsClientProps) {
  const router = useRouter()
  const [search, setSearch] = React.useState("")
  const [loadingId, setLoadingId] = React.useState<string | null>(null)

  const filtered = bots.filter((b) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      b.name.toLowerCase().includes(q) ||
      (b.username?.toLowerCase().includes(q) ?? false) ||
      b.user.name.toLowerCase().includes(q) ||
      b.user.email.toLowerCase().includes(q)
    )
  })

  async function handleToggleActive(bot: BotRow) {
    setLoadingId(bot.id)
    try {
      const result = await toggleBot(bot.id)
      if (result.success) {
        toast.success(`Bot ${bot.isActive ? "desativado" : "ativado"} com sucesso`)
        router.refresh()
      } else {
        toast.error(result.error ?? "Erro ao atualizar bot")
      }
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Todos os Bots</h1>
          <p className="text-sm text-slate-500 mt-1">
            {bots.length} bot(s) na plataforma
          </p>
        </div>
        <Button asChild className="bg-primary-600 hover:bg-primary-700 text-white">
          <Link href="/admin/bots/new">
            <Plus className="mr-2 h-4 w-4" />
            Novo Bot
          </Link>
        </Button>
      </div>

      {/* Search */}
      <Card className="bg-white border-slate-200/60">
        <CardContent className="pt-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome do bot, @username ou creator..."
            className="max-w-md bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white border-slate-200/60">
        <CardContent className="p-0">
          <div className="rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200/60 hover:bg-transparent">
                  <TableHead className="text-slate-500 pl-6">Bot</TableHead>
                  <TableHead className="text-slate-500">Creator</TableHead>
                  <TableHead className="text-slate-500">Status</TableHead>
                  <TableHead className="text-slate-500">Assinantes</TableHead>
                  <TableHead className="text-slate-500">Receita</TableHead>
                  <TableHead className="text-slate-500">Criado em</TableHead>
                  <TableHead className="text-slate-500 text-right pr-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow className="border-slate-200/60 hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="text-center text-slate-400 py-10"
                    >
                      Nenhum bot encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((bot) => (
                  <TableRow
                    key={bot.id}
                    className="border-slate-200/60 hover:bg-slate-50/50 transition-colors"
                  >
                    <TableCell className="pl-6">
                      <div>
                        <p className="text-slate-800 font-medium text-sm">{bot.name}</p>
                        {bot.username && (
                          <p className="text-slate-400 text-xs">@{bot.username}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-slate-700 text-sm">{bot.user.name}</p>
                        <p className="text-slate-400 text-xs">{bot.user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={bot.isActive ? "default" : "secondary"}
                        className={
                          bot.isActive
                            ? "bg-emerald-100 text-emerald-600 border border-emerald-600/30"
                            : "bg-slate-200 text-slate-500"
                        }
                      >
                        {bot.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-700 text-sm">
                      {bot.totalSubscribers ?? 0}
                    </TableCell>
                    <TableCell className="text-slate-700 text-sm">
                      {formatCurrency(bot.totalRevenue ?? 0)}
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {bot.createdAt ? formatDate(bot.createdAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-8 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                        >
                          <Link href={`/admin/bots/${bot.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Ver
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={loadingId === bot.id}
                          onClick={() => handleToggleActive(bot)}
                          className="h-8 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                        >
                          {bot.isActive ? (
                            <PowerOff className="h-3.5 w-3.5 mr-1" />
                          ) : (
                            <Power className="h-3.5 w-3.5 mr-1" />
                          )}
                          {bot.isActive ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
