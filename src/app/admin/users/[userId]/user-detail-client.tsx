"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Briefcase, Loader2, Unplug } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateUser } from "@/server/actions/admin.actions"
import type { UserRole } from "@/types"

interface ManagerOption {
  id: string
  name: string
  email: string
  platformFeePercent: number
}

interface UserDetailClientProps {
  userId: string
  currentPlatformFee: number | null
  currentIsActive: boolean
  currentRole: UserRole
  callerRole: UserRole
  currentManagedByUserId: string | null
  currentManagerFeePercent: number | null
  availableManagers: ManagerOption[]
}

export function UserDetailClient({
  userId,
  currentPlatformFee,
  currentIsActive,
  currentRole,
  callerRole,
  currentManagedByUserId,
  currentManagerFeePercent,
  availableManagers,
}: UserDetailClientProps) {
  const router = useRouter()
  const [fee, setFee] = React.useState(
    currentPlatformFee !== null ? String(currentPlatformFee) : ""
  )
  const [role, setRole] = React.useState<UserRole>(currentRole)
  const [isActive, setIsActive] = React.useState(currentIsActive)
  const [saving, setSaving] = React.useState(false)

  // Assignment de manager (só pra creators).
  const [managedBy, setManagedBy] = React.useState<string>(
    currentManagedByUserId ?? "none"
  )
  const [managerFee, setManagerFee] = React.useState(
    currentManagerFeePercent !== null ? String(currentManagerFeePercent) : ""
  )
  const [assignSaving, setAssignSaving] = React.useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const result = await updateUser(userId, {
        role,
        isActive,
        platformFeePercent: fee ? parseFloat(fee) : undefined,
      })
      if (result.success) {
        toast.success("Usuário atualizado com sucesso")
        router.refresh()
      } else {
        toast.error(result.error ?? "Erro ao atualizar usuário")
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleAssignManager(e: React.FormEvent) {
    e.preventDefault()
    setAssignSaving(true)
    try {
      const nextManagedBy = managedBy === "none" ? null : managedBy
      const nextFee =
        nextManagedBy === null ? null : managerFee ? parseFloat(managerFee) : 0
      const result = await updateUser(userId, {
        managedByUserId: nextManagedBy,
        managerFeePercent: nextFee,
      })
      if (result.success) {
        toast.success(
          nextManagedBy
            ? "Creator associado ao gestor"
            : "Creator removido do gestor"
        )
        router.refresh()
      } else {
        toast.error(result.error ?? "Erro ao atualizar gestão")
      }
    } finally {
      setAssignSaving(false)
    }
  }

  async function handleUnlinkManager() {
    if (!confirm("Remover este creator do gestor?")) return
    setAssignSaving(true)
    try {
      const result = await updateUser(userId, {
        managedByUserId: null,
        managerFeePercent: null,
      })
      if (result.success) {
        setManagedBy("none")
        setManagerFee("")
        toast.success("Creator desvinculado do gestor")
        router.refresh()
      } else {
        toast.error(result.error ?? "Erro ao desvincular")
      }
    } finally {
      setAssignSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900 text-base">Editar Configurações</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platform-fee" className="text-slate-700 text-sm">
                Taxa da Plataforma (%)
              </Label>
              <Input
                id="platform-fee"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="Ex: 10.00 (padrão da plataforma)"
                className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
              />
              <p className="text-xs text-slate-400">
                {currentRole === "manager"
                  ? "Cobrada sobre o bruto dos creators que este gestor gere."
                  : "Deixe em branco para usar a taxa padrão da plataforma."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-role" className="text-slate-700 text-sm">
                Role
              </Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger
                  id="user-role"
                  className="bg-slate-100 border-slate-200 text-slate-900"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-100 border-slate-200">
                  <SelectItem value="creator" className="text-slate-900">Creator</SelectItem>
                  <SelectItem value="manager" className="text-slate-900">Gestor</SelectItem>
                  <SelectItem value="admin" className="text-slate-900">Admin</SelectItem>
                  {callerRole === "owner" && (
                    <SelectItem value="owner" className="text-slate-900">Owner</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-status" className="text-slate-700 text-sm">
                Status
              </Label>
              <Select
                value={isActive ? "active" : "inactive"}
                onValueChange={(v) => setIsActive(v === "active")}
              >
                <SelectTrigger
                  id="user-status"
                  className="bg-slate-100 border-slate-200 text-slate-900"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-100 border-slate-200">
                  <SelectItem value="active" className="text-slate-900">Ativo</SelectItem>
                  <SelectItem value="inactive" className="text-slate-900">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {currentRole === "creator" && (
        <Card className="bg-white border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-slate-900 text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-amber-600" />
              Gestão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAssignManager} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-700 text-sm">Gestor associado</Label>
                <Select value={managedBy} onValueChange={setManagedBy}>
                  <SelectTrigger className="bg-slate-100 border-slate-200 text-slate-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-100 border-slate-200 max-h-60">
                    <SelectItem value="none" className="text-slate-900">
                      Sem gestor (standalone)
                    </SelectItem>
                    {availableManagers.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-slate-900">
                        {m.name} · {m.platformFeePercent.toFixed(1)}% plataforma
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400">
                  Creator standalone paga só taxa da plataforma própria.
                </p>
              </div>

              {managedBy !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="mgr-fee" className="text-slate-700 text-sm">
                    Taxa do Gestor (%) sobre o bruto
                  </Label>
                  <Input
                    id="mgr-fee"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={managerFee}
                    onChange={(e) => setManagerFee(e.target.value)}
                    placeholder="Ex: 20.00"
                    className="bg-slate-100 border-slate-200"
                  />
                  <p className="text-xs text-slate-400">
                    Aplicada sobre cada transação deste creator. Quando
                    gerenciado, a taxa da plataforma configurada no próprio
                    gestor prevalece sobre a do creator.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={assignSaving}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {assignSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : managedBy === "none" ? (
                    "Salvar (standalone)"
                  ) : currentManagedByUserId ? (
                    "Atualizar associação"
                  ) : (
                    "Associar ao gestor"
                  )}
                </Button>
                {currentManagedByUserId && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={assignSaving}
                    onClick={handleUnlinkManager}
                    className="border-red-200 text-red-700 hover:bg-red-50"
                  >
                    <Unplug className="h-4 w-4 mr-1" />
                    Desvincular
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
