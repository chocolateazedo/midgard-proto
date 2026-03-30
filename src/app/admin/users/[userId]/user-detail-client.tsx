"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
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

interface UserDetailClientProps {
  userId: string
  currentPlatformFee: number | null
  currentIsActive: boolean
  currentRole: UserRole
  callerRole: UserRole
}

export function UserDetailClient({
  userId,
  currentPlatformFee,
  currentIsActive,
  currentRole,
  callerRole,
}: UserDetailClientProps) {
  const router = useRouter()
  const [fee, setFee] = React.useState(
    currentPlatformFee !== null ? String(currentPlatformFee) : ""
  )
  const [role, setRole] = React.useState<UserRole>(currentRole)
  const [isActive, setIsActive] = React.useState(currentIsActive)
  const [saving, setSaving] = React.useState(false)

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

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-zinc-100 text-base">Editar Configurações</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="platform-fee" className="text-zinc-300 text-sm">
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
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
            <p className="text-xs text-zinc-500">
              Deixe em branco para usar a taxa padrão da plataforma.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role" className="text-zinc-300 text-sm">
              Role
            </Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger
                id="user-role"
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="creator" className="text-zinc-100">Creator</SelectItem>
                <SelectItem value="admin" className="text-zinc-100">Admin</SelectItem>
                {callerRole === "owner" && (
                  <SelectItem value="owner" className="text-zinc-100">Owner</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-status" className="text-zinc-300 text-sm">
              Status
            </Label>
            <Select
              value={isActive ? "active" : "inactive"}
              onValueChange={(v) => setIsActive(v === "active")}
            >
              <SelectTrigger
                id="user-status"
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="active" className="text-zinc-100">Ativo</SelectItem>
                <SelectItem value="inactive" className="text-zinc-100">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
