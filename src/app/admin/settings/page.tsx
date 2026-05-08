"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2, CheckCircle, XCircle, ChevronRight } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  getPlatformSettings,
  updatePlatformSetting,
} from "@/server/actions/admin.actions"
import {
  updateStorageSettings,
  updatePixSettings,
  testStorageConnection,
} from "@/server/actions/settings.actions"
import { detectWooviMainPixKey } from "@/server/actions/financial.actions"
import { TelegramIntegrationTab } from "./integration-tab"

type SettingMap = Record<string, string>

const VALID_TABS = ["pagamentos", "integracao", "storage"] as const
type TabValue = (typeof VALID_TABS)[number]

export default function AdminSettingsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      }
    >
      <AdminSettingsPageContent />
    </React.Suspense>
  )
}

function AdminSettingsPageContent() {
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get("tab")
  const initialTab: TabValue =
    requestedTab && (VALID_TABS as readonly string[]).includes(requestedTab)
      ? (requestedTab as TabValue)
      : "pagamentos"

  const [settings, setSettings] = React.useState<SettingMap>({})
  const [loading, setLoading] = React.useState(true)

  // Taxa Padrão da Plataforma — agora exibida na aba Pagamentos.
  const [platformFee, setPlatformFee] = React.useState("")

  // Storage tab state
  const [storageProvider, setStorageProvider] = React.useState<"s3" | "wasabi">("s3")
  const [storageBucket, setStorageBucket] = React.useState("")
  const [storageRegion, setStorageRegion] = React.useState("")
  const [storageEndpoint, setStorageEndpoint] = React.useState("")
  const [storageAccessKeyId, setStorageAccessKeyId] = React.useState("")
  const [storageSecretAccessKey, setStorageSecretAccessKey] = React.useState("")
  const [showStorageSecret, setShowStorageSecret] = React.useState(false)
  const [savingStorage, setSavingStorage] = React.useState(false)
  const [testingStorage, setTestingStorage] = React.useState(false)
  const [storageTestResult, setStorageTestResult] = React.useState<{
    success: boolean
    message: string
  } | null>(null)

  // Telegram tab state
  // webhookBaseUrl ainda é lido só pra exibir a URL do webhook Pix
  // na aba Pagamentos (substitui /telegram por /pix). Sem editor.
  const [webhookBaseUrl, setWebhookBaseUrl] = React.useState("")

  // Pix tab state
  const [pixProvider, setPixProvider] = React.useState<"mercadopago" | "efipay" | "asaas" | "woovi" | "mock">("efipay")
  const [pixAccessToken, setPixAccessToken] = React.useState("")
  const [pixWebhookSecret, setPixWebhookSecret] = React.useState("")
  const [showPixToken, setShowPixToken] = React.useState(false)
  const [showPixSecret, setShowPixSecret] = React.useState(false)
  const [splitEnabled, setSplitEnabled] = React.useState(false)
  // Limites globais de pagamento (centavos no DB, exibidos em reais).
  const [transactionFeeReais, setTransactionFeeReais] = React.useState("1,90")
  const [minTransactionReais, setMinTransactionReais] = React.useState("2,00")
  // Taxa escalonada de saque: se saldo < threshold, cobra fee.
  const [withdrawFeeThresholdReais, setWithdrawFeeThresholdReais] = React.useState("500,00")
  const [withdrawFeeBelowReais, setWithdrawFeeBelowReais] = React.useState("1,00")
  const [wooviMainPixKey, setWooviMainPixKey] = React.useState("")
  const [wooviMainPixKeyType, setWooviMainPixKeyType] = React.useState<"" | "EMAIL" | "CPF" | "CNPJ" | "PHONE" | "RANDOM">("")
  const [savingPix, setSavingPix] = React.useState(false)

  React.useEffect(() => {
    async function loadSettings() {
      const result = await getPlatformSettings()
      if (result.success && result.data) {
        const map: SettingMap = {}
        result.data.forEach((s) => {
          map[s.key] = s.value
        })
        setSettings(map)

        // Populate fields
        setPlatformFee(map.platform_fee_percent ?? "")
        setStorageProvider((map.storage_provider as "s3" | "wasabi") ?? "s3")
        setStorageBucket(map.storage_bucket ?? "")
        setStorageRegion(map.storage_region ?? "")
        setStorageEndpoint(map.storage_endpoint ?? "")
        // Sensitive fields: show masked value from server
        setStorageAccessKeyId(map.storage_access_key_id ?? "")
        setStorageSecretAccessKey(map.storage_secret_access_key ?? "")
        setWebhookBaseUrl(map.telegram_webhook_base_url ?? "")
        setPixProvider((map.pix_provider as "mercadopago" | "efipay" | "asaas" | "woovi" | "mock") ?? "efipay")
        setPixAccessToken(map.pix_access_token ?? "")
        setPixWebhookSecret(map.pix_webhook_secret ?? "")
        setSplitEnabled(map.split_enabled === "true")
        const feeCents = parseInt(map.transaction_fee_cents ?? "190", 10)
        const minCents = parseInt(map.min_transaction_cents ?? "200", 10)
        setTransactionFeeReais((feeCents / 100).toFixed(2).replace(".", ","))
        setMinTransactionReais((minCents / 100).toFixed(2).replace(".", ","))
        const wThresholdCents = parseInt(map.withdraw_fee_threshold_cents ?? "50000", 10)
        const wFeeCents = parseInt(map.withdraw_fee_below_threshold_cents ?? "100", 10)
        setWithdrawFeeThresholdReais((wThresholdCents / 100).toFixed(2).replace(".", ","))
        setWithdrawFeeBelowReais((wFeeCents / 100).toFixed(2).replace(".", ","))
        setWooviMainPixKey(map.woovi_main_pix_key ?? "")
        setWooviMainPixKeyType(
          (map.woovi_main_pix_key_type as "" | "EMAIL" | "CPF" | "CNPJ" | "PHONE" | "RANDOM") ?? "",
        )
      }
      setLoading(false)
    }
    loadSettings()
  }, [])

  async function handleSaveStorage(e: React.FormEvent) {
    e.preventDefault()
    setSavingStorage(true)
    setStorageTestResult(null)
    try {
      // Only send real values (not masked ****) for encrypted fields
      const accessKeyId = storageAccessKeyId.includes("*") ? "" : storageAccessKeyId
      const secretAccessKey = storageSecretAccessKey.includes("*") ? "" : storageSecretAccessKey

      if (!storageBucket || !storageRegion) {
        toast.error("Bucket e Region são obrigatórios")
        return
      }
      if (!accessKeyId || !secretAccessKey) {
        toast.error("Insira as credenciais de acesso (Access Key e Secret Key)")
        return
      }

      const result = await updateStorageSettings({
        provider: storageProvider,
        bucket: storageBucket,
        region: storageRegion,
        endpoint: storageEndpoint || undefined,
        accessKeyId,
        secretAccessKey,
      })

      if (result.success) {
        toast.success("Configurações de storage salvas com sucesso")
      } else {
        toast.error(result.error ?? "Erro ao salvar configurações de storage")
      }
    } finally {
      setSavingStorage(false)
    }
  }

  async function handleTestStorage() {
    setTestingStorage(true)
    setStorageTestResult(null)
    try {
      const result = await testStorageConnection()
      if (result.success && result.data) {
        setStorageTestResult({ success: true, message: result.data.message })
        toast.success(result.data.message)
      } else {
        const msg = result.error ?? "Falha ao conectar ao storage"
        setStorageTestResult({ success: false, message: msg })
        toast.error(msg)
      }
    } finally {
      setTestingStorage(false)
    }
  }

  async function handleSavePix(e: React.FormEvent) {
    e.preventDefault()
    setSavingPix(true)
    try {
      // Se o campo está mascarado (****), o usuário não digitou nada novo —
      // não enviamos pra preservar o valor existente em platform_settings.
      const tokenChanged = pixAccessToken.length > 0 && !pixAccessToken.includes("*")
      const secretChanged = pixWebhookSecret.length > 0 && !pixWebhookSecret.includes("*")
      const accessToken = tokenChanged ? pixAccessToken : undefined
      const webhookSecret = secretChanged ? pixWebhookSecret : undefined

      // Só exigir token quando o provider precisa de um E ainda não há um
      // salvo (campo limpo, sem máscara). Se já existe token salvo, deixa
      // editar só split_enabled sem precisar reentrar.
      const tokenAlreadySaved = !!settings.pix_access_token
      if (
        pixProvider !== "mock" &&
        !tokenChanged &&
        !tokenAlreadySaved
      ) {
        toast.error("Insira o Access Token do provedor Pix")
        return
      }

      // Parse de R$ → centavos (aceita vírgula ou ponto). Negativos viram 0.
      const parseReais = (v: string): number | null => {
        const cleaned = v.trim().replace(/\./g, "").replace(",", ".")
        const n = parseFloat(cleaned)
        if (!Number.isFinite(n) || n < 0) return null
        return Math.round(n * 100)
      }
      const feeCents = parseReais(transactionFeeReais)
      const minCents = parseReais(minTransactionReais)
      const withdrawThresholdCents = parseReais(withdrawFeeThresholdReais)
      const withdrawFeeCents = parseReais(withdrawFeeBelowReais)
      if (feeCents === null) {
        toast.error("Taxa por transação inválida")
        return
      }
      if (minCents === null) {
        toast.error("Valor mínimo por transação inválido")
        return
      }
      if (minCents < feeCents) {
        toast.error("Valor mínimo por transação não pode ser menor que a taxa")
        return
      }
      if (withdrawThresholdCents === null) {
        toast.error("Limite de taxa de saque inválido")
        return
      }
      if (withdrawFeeCents === null) {
        toast.error("Taxa de saque inválida")
        return
      }
      // Infere tipo da chave do formato (override só se admin não sobrepôs
      // via "Detectar" que setou explicitamente).
      const inferKeyType = (key: string): "" | "EMAIL" | "CPF" | "CNPJ" | "PHONE" | "RANDOM" => {
        const t = key.trim()
        if (!t) return ""
        if (t.includes("@")) return "EMAIL"
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return "RANDOM"
        if (/^\+\d{10,15}$/.test(t)) return "PHONE"
        const digits = t.replace(/\D/g, "")
        if (digits === t) {
          if (digits.length === 11) return "CPF"
          if (digits.length === 14) return "CNPJ"
          if (digits.length === 12 || digits.length === 13) return "PHONE"
        }
        return ""
      }
      // Se admin colou só a chave, infere e atualiza state localmente pra
      // refletir no save.
      let resolvedKeyType = wooviMainPixKeyType
      if (wooviMainPixKey.trim().length > 0 && !resolvedKeyType) {
        resolvedKeyType = inferKeyType(wooviMainPixKey)
        if (!resolvedKeyType) {
          toast.error(
            "Não consegui identificar o tipo da chave Pix. Use email, CPF (11 dígitos), CNPJ (14), telefone (+55...) ou UUID.",
          )
          return
        }
        setWooviMainPixKeyType(resolvedKeyType)
      }

      const result = await updatePixSettings({
        provider: pixProvider,
        accessToken,
        webhookSecret,
      })
      if (!result.success) {
        toast.error(result.error ?? "Erro ao salvar configurações Pix")
        return
      }
      // Salva flags + limites + taxa padrão em paralelo. Independentes.
      const tasks: Promise<{ success: boolean; error?: string }>[] = [
        updatePlatformSetting("split_enabled", splitEnabled ? "true" : "false", false),
        updatePlatformSetting("transaction_fee_cents", String(feeCents), false),
        updatePlatformSetting("min_transaction_cents", String(minCents), false),
        updatePlatformSetting(
          "withdraw_fee_threshold_cents",
          String(withdrawThresholdCents),
          false,
        ),
        updatePlatformSetting(
          "withdraw_fee_below_threshold_cents",
          String(withdrawFeeCents),
          false,
        ),
        updatePlatformSetting("woovi_main_pix_key", wooviMainPixKey.trim(), false),
        updatePlatformSetting(
          "woovi_main_pix_key_type",
          resolvedKeyType,
          false,
        ),
      ]
      if (platformFee) {
        tasks.push(updatePlatformSetting("platform_fee_percent", platformFee, false))
      }
      const results = await Promise.all(tasks)
      const failed = results.find((r) => !r.success)
      if (failed) {
        toast.error(failed.error ?? "Erro ao salvar configurações de pagamento")
        return
      }
      toast.success("Configurações Pix salvas com sucesso")
    } finally {
      setSavingPix(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações da Plataforma</h1>
        <p className="text-sm text-slate-500 mt-1">Gerencie todas as configurações globais do BotFans</p>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="bg-slate-100 border border-slate-200">
          <TabsTrigger
            value="pagamentos"
            className="data-[state=active]:bg-primary-600 data-[state=active]:text-white text-slate-500"
          >
            Pagamentos
          </TabsTrigger>
          <TabsTrigger
            value="integracao"
            className="data-[state=active]:bg-primary-600 data-[state=active]:text-white text-slate-500"
          >
            Integração
          </TabsTrigger>
          <TabsTrigger
            value="storage"
            className="data-[state=active]:bg-primary-600 data-[state=active]:text-white text-slate-500"
          >
            Storage
          </TabsTrigger>
        </TabsList>

        {/* TAB STORAGE */}
        <TabsContent value="storage">
          <Card className="bg-white border-slate-200/60">
            <CardHeader>
              <CardTitle className="text-slate-900">Storage (S3 / Wasabi)</CardTitle>
              <CardDescription className="text-slate-500">
                Configure o provedor de armazenamento de arquivos e previews.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveStorage} className="space-y-5 max-w-lg">
                <div className="space-y-2">
                  <Label className="text-slate-700">Provedor</Label>
                  <Select
                    value={storageProvider}
                    onValueChange={(v) => setStorageProvider(v as "s3" | "wasabi")}
                  >
                    <SelectTrigger className="bg-slate-100 border-slate-200 text-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-100 border-slate-200">
                      <SelectItem value="s3" className="text-slate-900">AWS S3</SelectItem>
                      <SelectItem value="wasabi" className="text-slate-900">Wasabi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storage-bucket" className="text-slate-700">Bucket Name</Label>
                  <Input
                    id="storage-bucket"
                    value={storageBucket}
                    onChange={(e) => setStorageBucket(e.target.value)}
                    placeholder="meu-bucket"
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storage-region" className="text-slate-700">Region</Label>
                  <Input
                    id="storage-region"
                    value={storageRegion}
                    onChange={(e) => setStorageRegion(e.target.value)}
                    placeholder="us-east-1"
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                    required
                  />
                </div>

                {storageProvider === "wasabi" && (
                  <div className="space-y-2">
                    <Label htmlFor="storage-endpoint" className="text-slate-700">
                      Endpoint URL (Wasabi)
                    </Label>
                    <Input
                      id="storage-endpoint"
                      type="url"
                      value={storageEndpoint}
                      onChange={(e) => setStorageEndpoint(e.target.value)}
                      placeholder="https://s3.us-east-1.wasabisys.com"
                      className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="storage-key-id" className="text-slate-700">Access Key ID</Label>
                  <Input
                    id="storage-key-id"
                    value={storageAccessKeyId}
                    onChange={(e) => setStorageAccessKeyId(e.target.value)}
                    placeholder={settings.storage_access_key_id ? "Alterar credencial..." : "AKIAIOSFODNN7EXAMPLE"}
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                  {settings.storage_access_key_id && (
                    <p className="text-xs text-slate-400">
                      Valor atual mascarado. Preencha para alterar.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storage-secret" className="text-slate-700">Secret Access Key</Label>
                  <div className="relative">
                    <Input
                      id="storage-secret"
                      type={showStorageSecret ? "text" : "password"}
                      value={storageSecretAccessKey}
                      onChange={(e) => setStorageSecretAccessKey(e.target.value)}
                      placeholder={settings.storage_secret_access_key ? "Alterar credencial..." : "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}
                      className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStorageSecret((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showStorageSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {settings.storage_secret_access_key && (
                    <p className="text-xs text-slate-400">
                      Valor atual mascarado. Preencha para alterar.
                    </p>
                  )}
                </div>

                {/* Test result */}
                {storageTestResult && (
                  <div
                    className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                      storageTestResult.success
                        ? "bg-emerald-900/30 text-emerald-600 border border-emerald-600/30"
                        : "bg-red-900/30 text-red-600 border border-red-600/30"
                    }`}
                  >
                    {storageTestResult.success ? (
                      <CheckCircle className="h-4 w-4 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0" />
                    )}
                    {storageTestResult.message}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testingStorage}
                    onClick={handleTestStorage}
                    className="border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    {testingStorage ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testando...
                      </>
                    ) : (
                      "Testar Conexão"
                    )}
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingStorage}
                    className="bg-primary-600 hover:bg-primary-700 text-white"
                  >
                    {savingStorage ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar configurações"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB PAGAMENTOS */}
        <TabsContent value="pagamentos">
          <Card className="bg-white border-slate-200/60">
            <CardHeader>
              <CardTitle className="text-slate-900">Pagamentos (Pix)</CardTitle>
              <CardDescription className="text-slate-500">
                Configure a integração com o provedor de pagamentos Pix.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSavePix} className="space-y-5 max-w-lg">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="platform-fee" className="text-slate-700 text-sm">
                        Taxa Padrão da Plataforma (%)
                      </Label>
                      <Input
                        id="platform-fee"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={platformFee}
                        onChange={(e) => setPlatformFee(e.target.value)}
                        placeholder="10.00"
                        className="bg-white border-slate-200 text-slate-900"
                      />
                      <p className="text-xs text-slate-400">
                        Aplicada em cada transação. Pode ser sobrescrita por creator.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="transaction-fee" className="text-slate-700 text-sm">
                        Taxa por transação (R$)
                      </Label>
                      <Input
                        id="transaction-fee"
                        type="text"
                        inputMode="decimal"
                        value={transactionFeeReais}
                        onChange={(e) => setTransactionFeeReais(e.target.value)}
                        placeholder="1,90"
                        className="bg-white border-slate-200 text-slate-900"
                      />
                      <p className="text-xs text-slate-400">
                        Soma ao platformFee em cada cobrança. Cobre o custo do PSP.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="min-transaction" className="text-slate-700 text-sm">
                        Valor mínimo da transação (R$)
                      </Label>
                      <Input
                        id="min-transaction"
                        type="text"
                        inputMode="decimal"
                        value={minTransactionReais}
                        onChange={(e) => setMinTransactionReais(e.target.value)}
                        placeholder="2,00"
                        className="bg-white border-slate-200 text-slate-900"
                      />
                      <p className="text-xs text-slate-400">
                        Aplicado em conteúdo pago, planos e lives com cobrança.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      Taxa escalonada de saque
                    </h3>
                    <p className="text-xs text-slate-500">
                      Saques abaixo do limite cobram uma taxa em reais, transferida
                      automaticamente da subconta do creator pra conta principal
                      da plataforma na Woovi. Acima do limite, saque é integral.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="wd-threshold" className="text-slate-700 text-sm">
                        Limite (R$)
                      </Label>
                      <Input
                        id="wd-threshold"
                        type="text"
                        inputMode="decimal"
                        value={withdrawFeeThresholdReais}
                        onChange={(e) => setWithdrawFeeThresholdReais(e.target.value)}
                        placeholder="500,00"
                        className="bg-white border-slate-200 text-slate-900"
                      />
                      <p className="text-xs text-slate-400">
                        Saques com saldo &lt; este valor pagam a taxa abaixo.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wd-fee" className="text-slate-700 text-sm">
                        Taxa abaixo do limite (R$)
                      </Label>
                      <Input
                        id="wd-fee"
                        type="text"
                        inputMode="decimal"
                        value={withdrawFeeBelowReais}
                        onChange={(e) => setWithdrawFeeBelowReais(e.target.value)}
                        placeholder="1,00"
                        className="bg-white border-slate-200 text-slate-900"
                      />
                      <p className="text-xs text-slate-400">
                        Cobrada antes do saque, deduz do valor sacado.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wd-main-pix" className="text-slate-700 text-sm">
                      Chave Pix da conta principal
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="wd-main-pix"
                        type="text"
                        value={wooviMainPixKey}
                        onChange={(e) => setWooviMainPixKey(e.target.value)}
                        placeholder="auto-detectado da Woovi"
                        className="bg-white border-slate-200 text-slate-900"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const r = await detectWooviMainPixKey()
                          if (!r.success || !r.data) {
                            toast.error(r.error ?? "Falha ao consultar Woovi")
                            return
                          }
                          const def = r.data.find((k) => k.isDefault) ?? r.data[0]
                          if (!def) {
                            toast.error("Woovi não retornou nenhuma chave Pix")
                            return
                          }
                          setWooviMainPixKey(def.key)
                          setWooviMainPixKeyType(def.type.toUpperCase() as "" | "EMAIL" | "CPF" | "CNPJ" | "PHONE" | "RANDOM")
                          toast.success(`Chave detectada: ${def.key}`)
                        }}
                        className="border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
                      >
                        Detectar
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400">
                      Tipo (CPF/CNPJ/email/telefone/aleatória) é detectado automaticamente
                      do formato. Vazio desabilita a cobrança.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-700">Provedor PSP</Label>
                  <Select
                    value={pixProvider}
                    onValueChange={(v) =>
                      setPixProvider(v as "mercadopago" | "efipay" | "asaas" | "woovi" | "mock")
                    }
                  >
                    <SelectTrigger className="bg-slate-100 border-slate-200 text-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-100 border-slate-200">
                      <SelectItem value="mock" className="text-slate-900">Mock (Teste)</SelectItem>
                      <SelectItem value="woovi" className="text-slate-900">Woovi (OpenPix)</SelectItem>
                      <SelectItem value="efipay" className="text-slate-900">EFÍ Pay</SelectItem>
                      <SelectItem value="mercadopago" className="text-slate-900">Mercado Pago</SelectItem>
                      <SelectItem value="asaas" className="text-slate-900">Asaas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {pixProvider === "mock" && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                    <strong>Modo de teste ativo.</strong> Nenhum pagamento real será processado. Quando um usuário comprar conteúdo no bot, o pagamento ficará pendente e poderá ser confirmado manualmente pela aba de simulação abaixo.
                  </div>
                )}

                {pixProvider !== "mock" && (
                  <div className="space-y-2">
                    <Label htmlFor="pix-token" className="text-slate-700">
                      {pixProvider === "woovi" ? "AppID" : "Access Token"}
                    </Label>
                    <div className="relative">
                      <Input
                        id="pix-token"
                        type={showPixToken ? "text" : "password"}
                        value={pixAccessToken}
                        onChange={(e) => setPixAccessToken(e.target.value)}
                        placeholder={settings.pix_access_token ? "Alterar token..." : pixProvider === "woovi" ? "AppID da Woovi/OpenPix" : "Seu token de acesso"}
                        className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400 pr-10"
                        required={!settings.pix_access_token}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPixToken((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        {showPixToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {settings.pix_access_token && (
                      <p className="text-xs text-slate-400">
                        Token atual mascarado. Preencha para alterar.
                      </p>
                    )}
                    {pixProvider === "woovi" && (
                      <p className="text-xs text-slate-400">
                        Encontre o AppID em API/Plugins no painel da Woovi.
                      </p>
                    )}
                  </div>
                )}

                {pixProvider !== "woovi" && pixProvider !== "mock" && (
                  <div className="space-y-2">
                    <Label htmlFor="pix-webhook-secret" className="text-slate-700">
                      Webhook Secret
                    </Label>
                    <div className="relative">
                      <Input
                        id="pix-webhook-secret"
                        type={showPixSecret ? "text" : "password"}
                        value={pixWebhookSecret}
                        onChange={(e) => setPixWebhookSecret(e.target.value)}
                        placeholder={settings.pix_webhook_secret ? "Alterar secret..." : "Chave secreta para validação de webhooks"}
                        className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPixSecret((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        {showPixSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      Usado para validar autenticidade dos webhooks recebidos do PSP.
                    </p>
                  </div>
                )}

                {pixProvider === "woovi" && (
                  <details className="group rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
                    <summary className="cursor-pointer font-medium select-none flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                      Configurações de webhooks
                    </summary>
                    <div className="mt-3 space-y-3">
                      <p>
                        A Woovi usa assinatura RSA para validar webhooks
                        automaticamente. Crie <strong>3 webhooks</strong> no painel
                        da Woovi, todos apontando para a mesma URL:
                      </p>
                      <div className="rounded bg-blue-100 px-2 py-1 font-mono break-all">
                        {webhookBaseUrl
                          ? webhookBaseUrl.replace("/telegram", "/pix")
                          : "https://seudominio.com/api/webhooks/pix"}
                      </div>
                      <ol className="space-y-2 list-decimal list-inside marker:text-blue-500">
                        <li>
                          <strong>Cobrança paga</strong> — evento{" "}
                          <code className="bg-blue-100 px-1 rounded">
                            OPENPIX:CHARGE_COMPLETED
                          </code>
                          . Confirma compras e assinaturas pagas via Pix.
                        </li>
                        <li>
                          <strong>Pagamento Externo Confirmado (Pix Out)</strong>{" "}
                          — evento{" "}
                          <code className="bg-blue-100 px-1 rounded">
                            OPENPIX:MOVEMENT_CONFIRMED
                          </code>
                          . Marca saques solicitados pelos creators/gestores como
                          concluídos.
                        </li>
                        <li>
                          <strong>Pagamento Externo com Falha (Pix Out)</strong>{" "}
                          — evento{" "}
                          <code className="bg-blue-100 px-1 rounded">
                            OPENPIX:MOVEMENT_FAILED
                          </code>
                          . Marca saques recusados pela Woovi com a mensagem de
                          erro do banco.
                        </li>
                      </ol>
                      <p className="text-blue-600/80">
                        Sem o segundo e terceiro webhooks, saques ficam parados
                        no estado <em>Pendente</em> indefinidamente — esses
                        eventos não têm fallback por polling.
                      </p>
                    </div>
                  </details>
                )}

                {pixProvider === "woovi" && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={splitEnabled}
                        onChange={(e) => setSplitEnabled(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div className="text-sm">
                        <p className="font-medium text-slate-800">
                          Habilitar Split Pix
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Quando ativado, cada cobrança saí com divisão
                          automática: creator e gestor (quando houver) recebem
                          em subcontas Woovi ativas; o restante fica na conta
                          da plataforma.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={savingPix}
                  className="bg-primary-600 hover:bg-primary-700 text-white"
                >
                  {savingPix ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar configurações"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {pixProvider === "mock" && (
            <MockPaymentSimulator />
          )}
        </TabsContent>

        {/* TAB INTEGRAÇÃO */}
        <TabsContent value="integracao">
          <TelegramIntegrationTab
            initialMaxPerHour={settings.bot_provisioning_max_per_hour ?? "12"}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

type MockPendingItem = {
  txid: string | null;
  type: "purchase" | "subscription";
  amount: number;
  description: string;
  contentType: string | null;
  botName: string;
  userName: string;
  createdAt: string;
};

function MockPaymentSimulator() {
  const [pending, setPending] = React.useState<MockPendingItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [confirmingTxid, setConfirmingTxid] = React.useState<string | null>(null)

  const loadPending = React.useCallback(async () => {
    try {
      const res = await fetch("/api/mock-pix/pending")
      const data = await res.json()
      if (data.success) {
        setPending(data.data)
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadPending()
    const interval = setInterval(loadPending, 5000)
    return () => clearInterval(interval)
  }, [loadPending])

  async function handleConfirm(txid: string) {
    setConfirmingTxid(txid)
    try {
      const res = await fetch("/api/mock-pix/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.data?.message ?? "Pagamento confirmado")
        setPending((prev) => prev.filter((p) => p.txid !== txid))
      } else {
        toast.error(data.error ?? "Erro ao confirmar")
      }
    } catch {
      toast.error("Erro ao confirmar pagamento")
    } finally {
      setConfirmingTxid(null)
    }
  }

  return (
    <Card className="bg-white border-slate-200/60 mt-6">
      <CardHeader>
        <CardTitle className="text-slate-900 flex items-center gap-2">
          Simulador de Pagamentos
        </CardTitle>
        <CardDescription className="text-slate-500">
          Pagamentos pendentes aguardando confirmação manual. Clique em &quot;Confirmar&quot; para simular o pagamento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            Nenhum pagamento pendente. Faça uma compra pelo bot do Telegram para testar.
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((item) => (
              <div
                key={item.txid}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.type === "purchase"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-purple-50 text-purple-700"
                    }`}>
                      {item.type === "purchase" ? "Compra" : "Assinatura"}
                    </span>
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {item.description}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {item.userName} &middot; {item.botName} &middot; {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span className="text-sm font-semibold text-emerald-600 shrink-0">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.amount)}
                </span>
                <Button
                  size="sm"
                  onClick={() => item.txid && handleConfirm(item.txid)}
                  disabled={confirmingTxid === item.txid}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                >
                  {confirmingTxid === item.txid ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Confirmar"
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
