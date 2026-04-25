"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Briefcase, Calendar, Loader2, Pencil, RefreshCw, Unplug, Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateUser } from "@/server/actions/admin.actions"
import { retryWooviProvisioning } from "@/server/actions/auth.actions"
import { formatDate } from "@/lib/utils"
import {
  formatCpfForDisplay,
  formatPhoneForDisplay,
  formatPixKeyForDisplay,
  pixKeyTypeLabel,
} from "@/lib/payment-format"
import {
  WooviSubAccountBadge,
  type WooviSubAccountStatus,
} from "@/components/shared/woovi-subaccount-badge"
import type { UserRole } from "@/types"

interface ManagerOption {
  id: string
  name: string
  email: string
  platformFeePercent: number
}

type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random"

interface UserDetailClientProps {
  userId: string
  currentName: string
  currentEmail: string
  currentPlatformFee: number | null
  currentIsActive: boolean
  currentRole: UserRole
  currentCreatedAt: Date | string | null
  callerRole: UserRole
  currentManagedByUserId: string | null
  currentManagerFeePercent: number | null
  availableManagers: ManagerOption[]
  currentCpf: string | null
  currentPhone: string | null
  currentPixKey: string | null
  currentPixKeyType: PixKeyType | null
  currentWooviStatus: WooviSubAccountStatus
  currentWooviError: string | null
}

export function UserDetailClient({
  userId,
  currentName,
  currentEmail,
  currentPlatformFee,
  currentIsActive,
  currentRole,
  currentCreatedAt,
  callerRole,
  currentManagedByUserId,
  currentManagerFeePercent,
  availableManagers,
  currentCpf,
  currentPhone,
  currentPixKey,
  currentPixKeyType,
  currentWooviStatus,
  currentWooviError,
}: UserDetailClientProps) {
  const router = useRouter()

  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(currentName)
  const [email, setEmail] = React.useState(currentEmail)
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

  // Dados de pagamento — só creator/manager.
  const mostraPagamento = currentRole === "creator" || currentRole === "manager"
  const [paymentEditing, setPaymentEditing] = React.useState(false)
  const [cpfInput, setCpfInput] = React.useState(currentCpf ? formatCpfForDisplay(currentCpf) : "")
  const [phoneInput, setPhoneInput] = React.useState(
    currentPhone ? formatPhoneForDisplay(currentPhone) : ""
  )
  const [pixKeyType, setPixKeyType] = React.useState<PixKeyType | "">(currentPixKeyType ?? "")
  const [pixKeyInput, setPixKeyInput] = React.useState(
    currentPixKey ? formatPixKeyForDisplay(currentPixKey, currentPixKeyType) : ""
  )
  const [paymentSaving, setPaymentSaving] = React.useState(false)
  const [retryingProvision, setRetryingProvision] = React.useState(false)

  async function handleRetryProvision() {
    setRetryingProvision(true)
    try {
      const result = await retryWooviProvisioning(userId)
      if (result.success) {
        toast.success("Provisionamento reenfileirado. Aguarde alguns segundos.")
        router.refresh()
      } else {
        toast.error(result.error ?? "Erro ao reprocessar")
      }
    } finally {
      setRetryingProvision(false)
    }
  }

  function resetPayment() {
    setCpfInput(currentCpf ? formatCpfForDisplay(currentCpf) : "")
    setPhoneInput(currentPhone ? formatPhoneForDisplay(currentPhone) : "")
    setPixKeyType(currentPixKeyType ?? "")
    setPixKeyInput(currentPixKey ? formatPixKeyForDisplay(currentPixKey, currentPixKeyType) : "")
  }

  async function handleSavePayment(e: React.FormEvent) {
    e.preventDefault()

    const cpfTrim = cpfInput.trim()
    const phoneTrim = phoneInput.trim()
    const pixTrim = pixKeyInput.trim()

    // Chave Pix e tipo andam em par.
    if ((pixTrim && !pixKeyType) || (!pixTrim && pixKeyType)) {
      toast.error("Informe o tipo da chave Pix e a chave.")
      return
    }

    setPaymentSaving(true)
    try {
      const payload: Parameters<typeof updateUser>[1] = {}
      // CPF: vazio = limpa; preenchido = novo valor (backend valida).
      if (cpfTrim !== (currentCpf ? formatCpfForDisplay(currentCpf) : "")) {
        payload.cpf = cpfTrim === "" ? null : cpfTrim
      }
      if (phoneTrim !== (currentPhone ? formatPhoneForDisplay(currentPhone) : "")) {
        payload.phone = phoneTrim === "" ? null : phoneTrim
      }
      const currentPixDisplay = currentPixKey
        ? formatPixKeyForDisplay(currentPixKey, currentPixKeyType)
        : ""
      const pixKeyChanged = pixTrim !== currentPixDisplay
      const pixTypeChanged = (pixKeyType || null) !== (currentPixKeyType ?? null)
      if (pixKeyChanged || pixTypeChanged) {
        if (pixTrim === "") {
          payload.pixKey = null
          payload.pixKeyType = null
        } else {
          payload.pixKey = pixTrim
          payload.pixKeyType = pixKeyType as PixKeyType
        }
      }

      if (Object.keys(payload).length === 0) {
        setPaymentEditing(false)
        return
      }

      const result = await updateUser(userId, payload)
      if (result.success) {
        toast.success("Dados de pagamento atualizados")
        setPaymentEditing(false)
        router.refresh()
      } else {
        toast.error(result.error ?? "Erro ao atualizar dados de pagamento")
      }
    } finally {
      setPaymentSaving(false)
    }
  }

  function resetForm() {
    setName(currentName)
    setEmail(currentEmail)
    setFee(currentPlatformFee !== null ? String(currentPlatformFee) : "")
    setRole(currentRole)
    setIsActive(currentIsActive)
  }

  function handleCancel() {
    resetForm()
    setEditing(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    if (trimmedName.length < 2) {
      toast.error("Nome deve ter pelo menos 2 caracteres")
      return
    }
    if (!trimmedEmail.includes("@")) {
      toast.error("Email inválido")
      return
    }

    setSaving(true)
    try {
      const result = await updateUser(userId, {
        name: trimmedName,
        email: trimmedEmail,
        role,
        isActive,
        platformFeePercent: fee ? parseFloat(fee) : undefined,
      })
      if (result.success) {
        toast.success("Usuário atualizado com sucesso")
        setEditing(false)
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-slate-900 text-base">Informações</CardTitle>
          {!editing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="h-8 border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Editar
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-name" className="text-slate-700 text-sm">
                  Nome
                </Label>
                <Input
                  id="user-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo"
                  className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-email" className="text-slate-700 text-sm">
                  Email
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                />
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
                  {role === "manager"
                    ? "Cobrada sobre o bruto dos creators que este gestor gere."
                    : "Deixe em branco para usar a taxa padrão da plataforma."}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={handleCancel}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Nome</span>
                <span className="text-slate-800">{currentName}</span>
              </div>
              <Separator className="bg-slate-100" />
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Email</span>
                <span className="text-slate-800 break-all text-right">{currentEmail}</span>
              </div>
              <Separator className="bg-slate-100" />
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Role</span>
                <RoleBadge role={currentRole} />
              </div>
              <Separator className="bg-slate-100" />
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <StatusBadge isActive={currentIsActive} />
              </div>
              <Separator className="bg-slate-100" />
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Cadastro</span>
                <span className="text-slate-800 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {currentCreatedAt ? formatDate(currentCreatedAt) : "—"}
                </span>
              </div>
              <Separator className="bg-slate-100" />
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Taxa plataforma</span>
                <span className="text-slate-800">
                  {currentPlatformFee !== null
                    ? `${currentPlatformFee.toFixed(1)}%`
                    : "Padrão"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {mostraPagamento && (
        <Card className="bg-white border-slate-200/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-slate-900 text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-600" />
                Dados de pagamento
              </CardTitle>
              <WooviSubAccountBadge
                status={currentWooviStatus}
                error={currentWooviError}
                hasPixKey={!!currentPixKey}
              />
            </div>
            {!paymentEditing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPaymentEditing(true)}
                className="h-8 border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Editar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {paymentEditing ? (
              <form onSubmit={handleSavePayment} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pay-cpf" className="text-slate-700 text-sm">
                    CPF
                  </Label>
                  <Input
                    id="pay-cpf"
                    type="text"
                    value={cpfInput}
                    onChange={(e) => setCpfInput(e.target.value)}
                    placeholder="000.000.000-00"
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pay-phone" className="text-slate-700 text-sm">
                    Celular
                  </Label>
                  <Input
                    id="pay-phone"
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pay-pix-type" className="text-slate-700 text-sm">
                    Tipo de chave Pix
                  </Label>
                  <Select
                    value={pixKeyType || "none"}
                    onValueChange={(v) => setPixKeyType(v === "none" ? "" : (v as PixKeyType))}
                  >
                    <SelectTrigger
                      id="pay-pix-type"
                      className="bg-slate-100 border-slate-200 text-slate-900"
                    >
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-100 border-slate-200">
                      <SelectItem value="none" className="text-slate-900">—</SelectItem>
                      <SelectItem value="cpf" className="text-slate-900">CPF</SelectItem>
                      <SelectItem value="cnpj" className="text-slate-900">CNPJ</SelectItem>
                      <SelectItem value="email" className="text-slate-900">E-mail</SelectItem>
                      <SelectItem value="phone" className="text-slate-900">Celular</SelectItem>
                      <SelectItem value="random" className="text-slate-900">Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pay-pix-key" className="text-slate-700 text-sm">
                    Chave Pix
                  </Label>
                  <Input
                    id="pay-pix-key"
                    type="text"
                    value={pixKeyInput}
                    onChange={(e) => setPixKeyInput(e.target.value)}
                    placeholder="Chave para recebimento"
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-400">
                    Usada como destino do repasse via Split Pix.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={paymentSaving}
                    className="flex-1 bg-primary-600 hover:bg-primary-700 text-white"
                  >
                    {paymentSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={paymentSaving}
                    onClick={() => {
                      resetPayment()
                      setPaymentEditing(false)
                    }}
                    className="border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">CPF</span>
                  <span className="text-slate-800">
                    {currentCpf ? formatCpfForDisplay(currentCpf) : "—"}
                  </span>
                </div>
                <Separator className="bg-slate-100" />
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Celular</span>
                  <span className="text-slate-800">
                    {currentPhone ? formatPhoneForDisplay(currentPhone) : "—"}
                  </span>
                </div>
                <Separator className="bg-slate-100" />
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tipo de chave Pix</span>
                  <span className="text-slate-800">
                    {pixKeyTypeLabel(currentPixKeyType) || "—"}
                  </span>
                </div>
                <Separator className="bg-slate-100" />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Chave Pix</span>
                  <span className="text-slate-800 break-all text-right">
                    {currentPixKey
                      ? formatPixKeyForDisplay(currentPixKey, currentPixKeyType)
                      : "—"}
                  </span>
                </div>
                {currentWooviStatus === "failed" && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
                    <p className="text-xs font-medium text-red-800">
                      Erro ao provisionar subconta Woovi
                    </p>
                    {currentWooviError && (
                      <p className="text-xs text-red-700 break-all">
                        {currentWooviError}
                      </p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleRetryProvision}
                      disabled={retryingProvision || !currentPixKey}
                      className="h-7 border-red-300 bg-white text-red-700 hover:bg-red-100"
                    >
                      {retryingProvision ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          Tentando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Tentar provisionar novamente
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

function RoleBadge({ role }: { role: UserRole }) {
  if (role === "owner") {
    return <Badge variant="destructive" className="text-xs">Owner</Badge>
  }
  if (role === "admin") {
    return (
      <Badge variant="default" className="text-xs bg-primary-600 hover:bg-primary-700">
        Admin
      </Badge>
    )
  }
  if (role === "manager") {
    return <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">Gestor</Badge>
  }
  return <Badge variant="secondary" className="text-xs">Creator</Badge>
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <Badge className="text-xs bg-emerald-100 text-emerald-600 border border-emerald-600/30 hover:bg-emerald-100">
        Ativo
      </Badge>
    )
  }
  return <Badge variant="secondary" className="text-xs">Inativo</Badge>
}
