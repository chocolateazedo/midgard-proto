"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import {
  Search,
  UserPlus,
  MoreHorizontal,
  Eye,
  ShieldCheck,
  UserX,
  KeyRound,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  updateUser,
  resetUserPassword,
  deleteUser,
} from "@/server/actions/admin.actions"
import { registerUser } from "@/server/actions/auth.actions"
import type { UserRole } from "@/types"

type UserRow = {
  id: string
  email: string
  name: string
  role: "owner" | "admin" | "creator"
  avatarUrl: string | null
  isActive: boolean | null
  platformFeePercent: string | null
  createdAt: Date | null
  updatedAt: Date | null
  activeBotCount: number
  totalBotCount: number
  totalRevenue: string
}

interface UsersClientPageProps {
  users: UserRow[]
  total: number
  page: number
  totalPages: number
  currentSearch: string
  currentRole: string
  currentStatus: string
  currentUserRole: UserRole
}

function RoleBadge({ role }: { role: "owner" | "admin" | "creator" }) {
  if (role === "owner") {
    return (
      <Badge variant="destructive" className="text-xs">
        Owner
      </Badge>
    )
  }
  if (role === "admin") {
    return (
      <Badge variant="default" className="text-xs bg-violet-600 hover:bg-violet-700">
        Admin
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-xs">
      Creator
    </Badge>
  )
}

function StatusBadge({ isActive }: { isActive: boolean | null }) {
  if (isActive) {
    return (
      <Badge className="text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/20">
        Ativo
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-xs">
      Inativo
    </Badge>
  )
}

export function UsersClientPage({
  users,
  total,
  page,
  totalPages,
  currentSearch,
  currentRole,
  currentStatus,
  currentUserRole,
}: UsersClientPageProps) {
  const router = useRouter()
  const pathname = usePathname()

  const [search, setSearch] = React.useState(currentSearch)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [inviteName, setInviteName] = React.useState("")
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<"admin" | "creator">("creator")
  const [inviteLoading, setInviteLoading] = React.useState(false)

  const [resetPasswordUser, setResetPasswordUser] = React.useState<UserRow | null>(null)
  const [deleteTargetUser, setDeleteTargetUser] = React.useState<UserRow | null>(null)

  function pushParams(overrides: Record<string, string>) {
    const sp = new URLSearchParams()
    if (search) sp.set("search", search)
    if (currentRole && currentRole !== "all") sp.set("role", currentRole)
    if (currentStatus && currentStatus !== "all") sp.set("status", currentStatus)
    sp.set("page", "1")
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === "all" || v === "") sp.delete(k)
      else sp.set(k, v)
    })
    router.push(`${pathname}?${sp.toString()}`)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    pushParams({ search, page: "1" })
  }

  async function handleToggleActive(user: UserRow) {
    const result = await updateUser(user.id, { isActive: !user.isActive })
    if (result.success) {
      toast.success(`Usuário ${user.isActive ? "desativado" : "ativado"} com sucesso`)
      router.refresh()
    } else {
      toast.error(result.error ?? "Erro ao atualizar usuário")
    }
  }

  async function handleChangeRole(userId: string, role: "owner" | "admin" | "creator") {
    const result = await updateUser(userId, { role })
    if (result.success) {
      toast.success("Role atualizado com sucesso")
      router.refresh()
    } else {
      toast.error(result.error ?? "Erro ao atualizar role")
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordUser) return
    const result = await resetUserPassword(resetPasswordUser.id)
    if (result.success && result.data) {
      toast.success(`Senha temporária: ${result.data.temporaryPassword}`, {
        duration: 10000,
        description: "Copie esta senha agora — ela não será exibida novamente.",
      })
      setResetPasswordUser(null)
    } else {
      toast.error(result.error ?? "Erro ao resetar senha")
    }
  }

  async function handleDeleteUser() {
    if (!deleteTargetUser) return
    const result = await deleteUser(deleteTargetUser.id)
    if (result.success) {
      toast.success("Usuário excluído com sucesso")
      setDeleteTargetUser(null)
      router.refresh()
    } else {
      toast.error(result.error ?? "Erro ao excluir usuário")
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteLoading(true)
    try {
      const tempPassword = Math.random().toString(36).slice(-8)
      const result = await registerUser({
        name: inviteName,
        email: inviteEmail,
        password: tempPassword,
        confirmPassword: tempPassword,
      })
      if (result.success) {
        // Update role if not creator
        if (inviteRole !== "creator") {
          const user = result.data as { id: string } | undefined
          if (user?.id) {
            await updateUser(user.id, { role: inviteRole })
          }
        }
        toast.success(`Usuário convidado! Senha temporária: ${tempPassword}`, {
          duration: 10000,
          description: "Compartilhe esta senha com o usuário.",
        })
        setInviteOpen(false)
        setInviteName("")
        setInviteEmail("")
        setInviteRole("creator")
        router.refresh()
      } else {
        toast.error(result.error ?? "Erro ao convidar usuário")
      }
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Usuários</h1>
          <p className="text-sm text-zinc-400 mt-1">{total} usuário(s) cadastrado(s)</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="bg-violet-600 hover:bg-violet-700 text-white shrink-0">
              <UserPlus className="h-4 w-4 mr-2" />
              Convidar Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
            <DialogHeader>
              <DialogTitle>Convidar Usuário</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Crie uma conta com senha temporária para o novo usuário.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name" className="text-zinc-200">Nome</Label>
                <Input
                  id="invite-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Nome completo"
                  required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email" className="text-zinc-200">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role" className="text-zinc-200">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "creator")}>
                  <SelectTrigger
                    id="invite-role"
                    className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="creator" className="text-zinc-100">Creator</SelectItem>
                    {currentUserRole === "owner" && (
                      <SelectItem value="admin" className="text-zinc-100">Admin</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInviteOpen(false)}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={inviteLoading}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {inviteLoading ? "Convidando..." : "Convidar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou email..."
                className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <Select
              value={currentRole}
              onValueChange={(v) => pushParams({ role: v, page: "1" })}
            >
              <SelectTrigger className="w-full sm:w-40 bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="all" className="text-zinc-100">Todos os roles</SelectItem>
                <SelectItem value="owner" className="text-zinc-100">Owner</SelectItem>
                <SelectItem value="admin" className="text-zinc-100">Admin</SelectItem>
                <SelectItem value="creator" className="text-zinc-100">Creator</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={currentStatus}
              onValueChange={(v) => pushParams({ status: v, page: "1" })}
            >
              <SelectTrigger className="w-full sm:w-40 bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="all" className="text-zinc-100">Todos</SelectItem>
                <SelectItem value="active" className="text-zinc-100">Ativos</SelectItem>
                <SelectItem value="inactive" className="text-zinc-100">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white">
              Buscar
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <div className="rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 pl-6">Usuário</TableHead>
                  <TableHead className="text-zinc-400">Role</TableHead>
                  <TableHead className="text-zinc-400">Bots ativos</TableHead>
                  <TableHead className="text-zinc-400">Receita total</TableHead>
                  <TableHead className="text-zinc-400">Cadastro</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400 text-right pr-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 && (
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="text-center text-zinc-500 py-10"
                    >
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {users.map((user) => (
                  <TableRow
                    key={user.id}
                    className="border-zinc-800 hover:bg-zinc-800/50 transition-colors"
                  >
                    <TableCell className="pl-6">
                      <div>
                        <p className="text-zinc-200 font-medium text-sm">{user.name}</p>
                        <p className="text-zinc-500 text-xs">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell className="text-zinc-300 text-sm">
                      {user.activeBotCount}/{user.totalBotCount}
                    </TableCell>
                    <TableCell className="text-zinc-300 text-sm">
                      {formatCurrency(parseFloat(user.totalRevenue))}
                    </TableCell>
                    <TableCell className="text-zinc-400 text-sm">
                      {user.createdAt ? formatDate(user.createdAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge isActive={user.isActive} />
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-zinc-900 border-zinc-700 text-zinc-100"
                        >
                          <DropdownMenuLabel className="text-zinc-400 text-xs">
                            Ações
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem asChild className="cursor-pointer hover:bg-zinc-800">
                            <Link href={`/admin/users/${user.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver detalhes
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuLabel className="text-zinc-400 text-xs">
                            Mudar role
                          </DropdownMenuLabel>
                          {(["creator", "admin"] as const).map((r) => (
                            <DropdownMenuItem
                              key={r}
                              className="cursor-pointer hover:bg-zinc-800 capitalize"
                              disabled={user.role === r}
                              onClick={() => handleChangeRole(user.id, r)}
                            >
                              <ShieldCheck className="h-4 w-4 mr-2" />
                              {r}
                            </DropdownMenuItem>
                          ))}
                          {currentUserRole === "owner" && user.role !== "owner" && (
                            <DropdownMenuItem
                              className="cursor-pointer hover:bg-zinc-800"
                              onClick={() => handleChangeRole(user.id, "owner")}
                            >
                              <ShieldCheck className="h-4 w-4 mr-2" />
                              owner
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem
                            className="cursor-pointer hover:bg-zinc-800"
                            onClick={() => handleToggleActive(user)}
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            {user.isActive ? "Desativar" : "Ativar"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer hover:bg-zinc-800"
                            onClick={() => setResetPasswordUser(user)}
                          >
                            <KeyRound className="h-4 w-4 mr-2" />
                            Resetar senha
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem
                            className="cursor-pointer text-red-400 hover:bg-red-900/30 hover:text-red-400 focus:text-red-400 focus:bg-red-900/30"
                            onClick={() => setDeleteTargetUser(user)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => pushParams({ page: String(page - 1) })}
              className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => pushParams({ page: String(page + 1) })}
              className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Reset Password AlertDialog */}
      <AlertDialog open={!!resetPasswordUser} onOpenChange={(o) => !o && setResetPasswordUser(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar Senha</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Uma senha temporária será gerada para{" "}
              <span className="text-zinc-200 font-medium">{resetPasswordUser?.name}</span>.
              Você precisará compartilhá-la manualmente com o usuário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setResetPasswordUser(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 bg-transparent"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetPassword}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              Resetar senha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete AlertDialog */}
      <AlertDialog open={!!deleteTargetUser} onOpenChange={(o) => !o && setDeleteTargetUser(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Tem certeza que deseja excluir{" "}
              <span className="text-zinc-200 font-medium">{deleteTargetUser?.name}</span>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeleteTargetUser(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 bg-transparent"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
