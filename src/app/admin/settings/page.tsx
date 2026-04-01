"use client"

import * as React from "react"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
  updateTelegramSettings,
  updatePixSettings,
  testStorageConnection,
} from "@/server/actions/settings.actions"

type SettingMap = Record<string, string>

export default function AdminSettingsPage() {
  const [settings, setSettings] = React.useState<SettingMap>({})
  const [loading, setLoading] = React.useState(true)

  // Geral tab state
  const [platformFee, setPlatformFee] = React.useState("")
  const [platformName, setPlatformName] = React.useState("")
  const [platformUrl, setPlatformUrl] = React.useState("")
  const [savingGeral, setSavingGeral] = React.useState(false)

  // Storage tab state
  const [storageProvider, setStorageProvider] = React.useState<"s3" | "wasabi">("s3")
  const [storageBucket, setStorageBucket] = React.useState("")
  const [storageRegion, setStorageRegion] = React.useState("")
  const [storageEndpoint, setStorageEndpoint] = React.useState("")
  const [storageAccessKeyId, setStorageAccessKeyId] = React.useState("")
  const [storageSecretAccessKey, setStorageSecretAccessKey] = React.useState("")
  const [storagePublicBaseUrl, setStoragePublicBaseUrl] = React.useState("")
  const [showStorageSecret, setShowStorageSecret] = React.useState(false)
  const [savingStorage, setSavingStorage] = React.useState(false)
  const [testingStorage, setTestingStorage] = React.useState(false)
  const [storageTestResult, setStorageTestResult] = React.useState<{
    success: boolean
    message: string
  } | null>(null)

  // Telegram tab state
  const [welcomeMessage, setWelcomeMessage] = React.useState("")
  const [webhookBaseUrl, setWebhookBaseUrl] = React.useState("")
  const [savingTelegram, setSavingTelegram] = React.useState(false)

  // Pix tab state
  const [pixProvider, setPixProvider] = React.useState<"mercadopago" | "efipay" | "asaas">("efipay")
  const [pixAccessToken, setPixAccessToken] = React.useState("")
  const [pixWebhookSecret, setPixWebhookSecret] = React.useState("")
  const [showPixToken, setShowPixToken] = React.useState(false)
  const [showPixSecret, setShowPixSecret] = React.useState(false)
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
        setPlatformName(map.platform_name ?? "")
        setPlatformUrl(map.platform_base_url ?? "")
        setStorageProvider((map.storage_provider as "s3" | "wasabi") ?? "s3")
        setStorageBucket(map.storage_bucket ?? "")
        setStorageRegion(map.storage_region ?? "")
        setStorageEndpoint(map.storage_endpoint ?? "")
        setStoragePublicBaseUrl(map.storage_public_base_url ?? "")
        // Sensitive fields: show masked value from server
        setStorageAccessKeyId(map.storage_access_key_id ?? "")
        setStorageSecretAccessKey(map.storage_secret_access_key ?? "")
        setWelcomeMessage(map.telegram_default_welcome_message ?? "")
        setWebhookBaseUrl(map.telegram_webhook_base_url ?? "")
        setPixProvider((map.pix_provider as "mercadopago" | "efipay" | "asaas") ?? "efipay")
        setPixAccessToken(map.pix_access_token ?? "")
        setPixWebhookSecret(map.pix_webhook_secret ?? "")
      }
      setLoading(false)
    }
    loadSettings()
  }, [])

  async function handleSaveGeral(e: React.FormEvent) {
    e.preventDefault()
    setSavingGeral(true)
    try {
      const tasks: Promise<{ success: boolean; error?: string }>[] = []
      if (platformFee) tasks.push(updatePlatformSetting("platform_fee_percent", platformFee, false))
      if (platformName) tasks.push(updatePlatformSetting("platform_name", platformName, false))
      if (platformUrl) tasks.push(updatePlatformSetting("platform_base_url", platformUrl, false))

      const results = await Promise.all(tasks)
      const failed = results.find((r) => !r.success)
      if (failed) {
        toast.error(failed.error ?? "Erro ao salvar configurações")
      } else {
        toast.success("Configurações gerais salvas com sucesso")
      }
    } finally {
      setSavingGeral(false)
    }
  }

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
        publicBaseUrl: storagePublicBaseUrl || undefined,
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

  async function handleSaveTelegram(e: React.FormEvent) {
    e.preventDefault()
    setSavingTelegram(true)
    try {
      const result = await updateTelegramSettings({
        defaultWelcomeMessage: welcomeMessage,
        webhookBaseUrl,
      })
      if (result.success) {
        toast.success("Configurações do Telegram salvas com sucesso")
      } else {
        toast.error(result.error ?? "Erro ao salvar configurações do Telegram")
      }
    } finally {
      setSavingTelegram(false)
    }
  }

  async function handleSavePix(e: React.FormEvent) {
    e.preventDefault()
    setSavingPix(true)
    try {
      const accessToken = pixAccessToken.includes("*") ? "" : pixAccessToken
      const webhookSecret = pixWebhookSecret.includes("*") ? "" : pixWebhookSecret

      if (!accessToken) {
        toast.error("Insira o Access Token do provedor Pix")
        return
      }

      const result = await updatePixSettings({
        provider: pixProvider,
        accessToken,
        webhookSecret: webhookSecret || undefined,
      })
      if (result.success) {
        toast.success("Configurações Pix salvas com sucesso")
      } else {
        toast.error(result.error ?? "Erro ao salvar configurações Pix")
      }
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
        <p className="text-sm text-slate-500 mt-1">Gerencie todas as configurações globais do BotFlow</p>
      </div>

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList className="bg-slate-100 border border-slate-200">
          <TabsTrigger
            value="geral"
            className="data-[state=active]:bg-primary-600 data-[state=active]:text-white text-slate-500"
          >
            Geral
          </TabsTrigger>
          <TabsTrigger
            value="storage"
            className="data-[state=active]:bg-primary-600 data-[state=active]:text-white text-slate-500"
          >
            Storage
          </TabsTrigger>
          <TabsTrigger
            value="telegram"
            className="data-[state=active]:bg-primary-600 data-[state=active]:text-white text-slate-500"
          >
            Telegram
          </TabsTrigger>
          <TabsTrigger
            value="pagamentos"
            className="data-[state=active]:bg-primary-600 data-[state=active]:text-white text-slate-500"
          >
            Pagamentos
          </TabsTrigger>
        </TabsList>

        {/* TAB GERAL */}
        <TabsContent value="geral">
          <Card className="bg-white border-slate-200/60">
            <CardHeader>
              <CardTitle className="text-slate-900">Configurações Gerais</CardTitle>
              <CardDescription className="text-slate-500">
                Parâmetros globais da plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveGeral} className="space-y-5 max-w-lg">
                <div className="space-y-2">
                  <Label htmlFor="platform-name" className="text-slate-700">
                    Nome da Plataforma
                  </Label>
                  <Input
                    id="platform-name"
                    value={platformName}
                    onChange={(e) => setPlatformName(e.target.value)}
                    placeholder="BotFlow"
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="platform-url" className="text-slate-700">
                    URL Base da Plataforma
                  </Label>
                  <Input
                    id="platform-url"
                    type="url"
                    value={platformUrl}
                    onChange={(e) => setPlatformUrl(e.target.value)}
                    placeholder="https://meudominio.com"
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-400">
                    Usada para construir URLs de webhooks do Telegram.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="platform-fee" className="text-slate-700">
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
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-400">
                    Percentual cobrado em cada transação. Pode ser sobrescrito por creator.
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={savingGeral}
                  className="bg-primary-600 hover:bg-primary-700 text-white"
                >
                  {savingGeral ? (
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
        </TabsContent>

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

                <div className="space-y-2">
                  <Label htmlFor="storage-public-url" className="text-slate-700">
                    URL Pública Base
                  </Label>
                  <Input
                    id="storage-public-url"
                    type="url"
                    value={storagePublicBaseUrl}
                    onChange={(e) => setStoragePublicBaseUrl(e.target.value)}
                    placeholder="https://cdn.meudominio.com"
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-400">
                    Opcional. URL base para arquivos públicos (CDN).
                  </p>
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

        {/* TAB TELEGRAM */}
        <TabsContent value="telegram">
          <Card className="bg-white border-slate-200/60">
            <CardHeader>
              <CardTitle className="text-slate-900">Telegram</CardTitle>
              <CardDescription className="text-slate-500">
                Configurações padrão aplicadas a todos os bots da plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveTelegram} className="space-y-5 max-w-lg">
                <div className="space-y-2">
                  <Label htmlFor="welcome-msg" className="text-slate-700">
                    Mensagem de Boas-vindas Padrão
                  </Label>
                  <Textarea
                    id="welcome-msg"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    rows={5}
                    placeholder="Olá! Bem-vindo ao bot. Use /catalog para ver os conteúdos disponíveis."
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400 resize-none"
                    required
                  />
                  <p className="text-xs text-slate-400">
                    Suporta Markdown do Telegram: *negrito*, _itálico_, `código`.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhook-base-url" className="text-slate-700">
                    URL Base dos Webhooks
                  </Label>
                  <Input
                    id="webhook-base-url"
                    type="url"
                    value={webhookBaseUrl}
                    onChange={(e) => setWebhookBaseUrl(e.target.value)}
                    placeholder="https://meudominio.com/api/webhooks/telegram"
                    className="bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                    required
                  />
                  <p className="text-xs text-slate-400">
                    Cada bot recebe seu webhook em {webhookBaseUrl || "URL"}/&#123;botId&#125;
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={savingTelegram}
                  className="bg-primary-600 hover:bg-primary-700 text-white"
                >
                  {savingTelegram ? (
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
                <div className="space-y-2">
                  <Label className="text-slate-700">Provedor PSP</Label>
                  <Select
                    value={pixProvider}
                    onValueChange={(v) =>
                      setPixProvider(v as "mercadopago" | "efipay" | "asaas")
                    }
                  >
                    <SelectTrigger className="bg-slate-100 border-slate-200 text-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-100 border-slate-200">
                      <SelectItem value="efipay" className="text-slate-900">EFÍ Pay</SelectItem>
                      <SelectItem value="mercadopago" className="text-slate-900">Mercado Pago</SelectItem>
                      <SelectItem value="asaas" className="text-slate-900">Asaas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pix-token" className="text-slate-700">Access Token</Label>
                  <div className="relative">
                    <Input
                      id="pix-token"
                      type={showPixToken ? "text" : "password"}
                      value={pixAccessToken}
                      onChange={(e) => setPixAccessToken(e.target.value)}
                      placeholder={settings.pix_access_token ? "Alterar token..." : "Seu token de acesso"}
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
                </div>

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
        </TabsContent>
      </Tabs>
    </div>
  )
}
