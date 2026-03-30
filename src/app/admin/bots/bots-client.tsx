"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ExternalLink, Power, PowerOff } from "lucide-react"
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
  totalRevenue: string | null
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
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Todos os Bots</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {bots.length} bot(s) na plataforma
        </p>
      </div>

      {/* Search */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome do bot, @username ou creator..."
            className="max-w-md bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <div className="rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 pl-6">Bot</TableHead>
                  <TableHead className="text-zinc-400">Creator</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Assinantes</TableHead>
                  <TableHead className="text-zinc-400">Receita</TableHead>
                  <TableHead className="text-zinc-400">Criado em</TableHead>
                  <TableHead className="text-zinc-400 text-right pr-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="text-center text-zinc-500 py-10"
                    >
                      Nenhum bot encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((bot) => (
                  <TableRow
                    key={bot.id}
                    className="border-zinc-800 hover:bg-zinc-800/50 transition-colors"
                  >
                    <TableCell className="pl-6">
                      <div>
                        <p className="text-zinc-200 font-medium text-sm">{bot.name}</p>
                        {bot.username && (
                          <p className="text-zinc-500 text-xs">@{bot.username}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-zinc-300 text-sm">{bot.user.name}</p>
                        <p className="text-zinc-500 text-xs">{bot.user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={bot.isActive ? "default" : "secondary"}
                        className={
                          bot.isActive
                            ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                            : "bg-zinc-700 text-zinc-400"
                        }
                      >
                        {bot.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-300 text-sm">
                      {bot.totalSubscribers ?? 0}
                    </TableCell>
                    <TableCell className="text-zinc-300 text-sm">
                      {formatCurrency(parseFloat(bot.totalRevenue ?? "0"))}
                    </TableCell>
                    <TableCell className="text-zinc-400 text-sm">
                      {bot.createdAt ? formatDate(bot.createdAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                        >
                          <Link href={`/dashboard/bots/${bot.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Ver
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={loadingId === bot.id}
                          onClick={() => handleToggleActive(bot)}
                          className="h-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
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
