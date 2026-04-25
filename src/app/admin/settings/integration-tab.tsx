"use client";

import * as React from "react";
import { CheckCircle2, Copy, Loader2, MessageCircle, Plug, RefreshCw, Unplug, UserCog, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  disconnectTelegram,
  getTelegramIntegrationStatus,
  rotateIntegrationSecret,
  startTelegramLogin,
  updateProvisioningRateLimit,
  verifyTelegramCode,
} from "@/server/actions/telegram-integration.actions";

type Props = {
  initialMaxPerHour: string;
};

export function TelegramIntegrationTab({ initialMaxPerHour }: Props) {
  const [status, setStatus] = React.useState<{
    connected: boolean;
    phone?: string;
    username?: string;
    firstName?: string;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Form: credenciais da conta Telegram
  const [apiId, setApiId] = React.useState("");
  const [apiHash, setApiHash] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [sending, setSending] = React.useState(false);

  // Form: OTP recebido
  const [phoneCodeHash, setPhoneCodeHash] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [twoFaPassword, setTwoFaPassword] = React.useState("");
  const [verifying, setVerifying] = React.useState(false);

  const [disconnecting, setDisconnecting] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);

  // Rate limit
  const [maxPerHour, setMaxPerHour] = React.useState(initialMaxPerHour);
  const [savingRate, setSavingRate] = React.useState(false);

  // Secret
  const [newSecret, setNewSecret] = React.useState<string | null>(null);
  const [rotating, setRotating] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const res = await getTelegramIntegrationStatus();
    if (res.success && res.data) setStatus(res.data);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleStartLogin(e: React.FormEvent) {
    e.preventDefault();
    const apiIdNum = Number(apiId);
    if (!Number.isInteger(apiIdNum) || apiIdNum <= 0) {
      toast.error("api_id deve ser numérico");
      return;
    }
    setSending(true);
    try {
      const res = await startTelegramLogin({
        apiId: apiIdNum,
        apiHash: apiHash.trim(),
        phone: phone.trim(),
      });
      if (res.success && res.data) {
        setPhoneCodeHash(res.data.phoneCodeHash);
        toast.success(
          res.data.isCodeViaApp
            ? "Código enviado para o app Telegram da conta"
            : "Código enviado por SMS",
        );
      } else {
        toast.error(res.error ?? "Erro ao enviar código");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneCodeHash) return;
    setVerifying(true);
    try {
      const res = await verifyTelegramCode({
        phone: phone.trim(),
        phoneCodeHash,
        code: code.trim(),
        password: twoFaPassword.trim() || undefined,
      });
      if (res.success && res.data) {
        toast.success(
          res.data.username
            ? `Conectado como @${res.data.username}`
            : "Conexão estabelecida",
        );
        setPhoneCodeHash(null);
        setCode("");
        setTwoFaPassword("");
        setApiId("");
        setApiHash("");
        setPhone("");
        await refresh();
      } else {
        toast.error(res.error ?? "Erro ao verificar código");
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar a sessão MTProto? O provisionamento de bots ficará indisponível.")) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await disconnectTelegram();
      if (res.success) {
        toast.success("Sessão desconectada");
        await refresh();
      } else {
        toast.error(res.error ?? "Erro ao desconectar");
      }
    } finally {
      setDisconnecting(false);
    }
  }

  /**
   * Trocar usuário = desconecta a sessão atual e abre o form pra um
   * novo login MTProto. Comportamento idêntico ao desconectar +
   * formulário, mas com o intent claro pro admin.
   */
  async function handleSwitchUser() {
    if (!confirm("Trocar a conta Telegram? A sessão atual será encerrada e o provisionamento de bots fica indisponível até concluir o novo login.")) {
      return;
    }
    setSwitching(true);
    try {
      const res = await disconnectTelegram();
      if (res.success) {
        // Limpa qualquer estado de form anterior pra cair direto no input vazio.
        setApiId("");
        setApiHash("");
        setPhone("");
        setPhoneCodeHash(null);
        setCode("");
        setTwoFaPassword("");
        toast.success("Sessão encerrada — preencha os dados da nova conta");
        await refresh();
      } else {
        toast.error(res.error ?? "Erro ao encerrar sessão");
      }
    } finally {
      setSwitching(false);
    }
  }

  async function handleSaveRate(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(maxPerHour);
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      toast.error("Limite deve estar entre 1 e 500");
      return;
    }
    setSavingRate(true);
    try {
      const res = await updateProvisioningRateLimit({ maxPerHour: value });
      if (res.success) toast.success("Limite atualizado");
      else toast.error(res.error ?? "Erro ao salvar limite");
    } finally {
      setSavingRate(false);
    }
  }

  async function handleRotateSecret() {
    if (!confirm("Gerar novo secret? O valor atual será invalidado imediatamente.")) return;
    setRotating(true);
    try {
      const res = await rotateIntegrationSecret();
      if (res.success && res.data) {
        setNewSecret(res.data.secret);
        toast.success("Novo secret gerado — copie agora, não será exibido novamente");
      } else {
        toast.error(res.error ?? "Erro ao gerar secret");
      }
    } finally {
      setRotating(false);
    }
  }

  async function copySecret() {
    if (!newSecret) return;
    await navigator.clipboard.writeText(newSecret);
    toast.success("Secret copiado");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* ------------------------------------------------------------- */}
      {/* SEÇÃO 1: Integração com Telegram (conta MTProto que cria bots) */}
      {/* ------------------------------------------------------------- */}
      <section className="space-y-4">
        <div className="flex items-start gap-3 border-b border-slate-200 pb-3">
          <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
            <MessageCircle className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Integração com Telegram
            </h2>
            <p className="text-sm text-slate-500">
              Conta de usuário Telegram que a plataforma usa pra:{" "}
              <strong>criar bots automaticamente</strong> via @BotFather,
              fazer <strong>backup de dados</strong> de bots/canais e
              executar tarefas de manutenção que exigem uma conta humana
              do Telegram (não só o token de bot).
            </p>
          </div>
        </div>

      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900">Conta Telegram (MTProto)</CardTitle>
          <CardDescription className="text-slate-500">
            Conta de usuário usada para criar novos bots via @BotFather. Obtenha{" "}
            <code className="bg-slate-100 px-1 rounded">api_id</code> e{" "}
            <code className="bg-slate-100 px-1 rounded">api_hash</code> em{" "}
            <a
              href="https://my.telegram.org"
              target="_blank"
              rel="noreferrer"
              className="text-primary-600 underline"
            >
              my.telegram.org
            </a>
            . Uma sessão por ambiente — dev e prod não podem compartilhar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status?.connected ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-emerald-600/30 bg-emerald-50 p-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-800">
                  <div className="font-medium">Sessão conectada</div>
                  <div className="text-emerald-700 mt-0.5">
                    {status.username ? `@${status.username}` : status.firstName ?? "—"}
                    {status.phone ? ` · ${status.phone}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={switching || disconnecting}
                  onClick={handleSwitchUser}
                  className="border-primary-300 text-primary-700 hover:bg-primary-50"
                >
                  {switching ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <UserCog className="h-4 w-4 mr-2" />
                  )}
                  Trocar usuário
                </Button>
                <Button
                  variant="outline"
                  disabled={disconnecting || switching}
                  onClick={handleDisconnect}
                  className="border-red-200 text-red-700 hover:bg-red-50"
                >
                  {disconnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Unplug className="h-4 w-4 mr-2" />
                  )}
                  Desconectar
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                Trocar usuário encerra a sessão atual e abre o login da
                nova conta. Desconectar apenas para o provisionamento.
              </p>
            </div>
          ) : !phoneCodeHash ? (
            <form onSubmit={handleStartLogin} className="space-y-4 max-w-lg">
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <XCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <div className="font-medium">Sessão desconectada</div>
                  <div className="text-amber-700 mt-0.5">
                    Provisionamento de bots está indisponível até reconectar.
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="api-id" className="text-slate-700">api_id</Label>
                  <Input
                    id="api-id"
                    value={apiId}
                    onChange={(e) => setApiId(e.target.value)}
                    placeholder="1234567"
                    required
                    className="bg-slate-100 border-slate-200 text-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-hash" className="text-slate-700">api_hash</Label>
                  <Input
                    id="api-hash"
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    placeholder="abcdef0123456789abcdef0123456789"
                    required
                    className="bg-slate-100 border-slate-200 text-slate-900"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-700">Telefone (E.164)</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+5511999999999"
                  required
                  className="bg-slate-100 border-slate-200 text-slate-900"
                />
                <p className="text-xs text-slate-400">
                  O Telegram enviará o código para o app (ou SMS se o app não estiver logado).
                </p>
              </div>
              <Button
                type="submit"
                disabled={sending}
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando código...
                  </>
                ) : (
                  "Enviar código"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4 max-w-lg">
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                Código enviado para <strong>{phone}</strong>. Digite abaixo.
              </div>
              <div className="space-y-2">
                <Label htmlFor="code" className="text-slate-700">Código recebido</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="12345"
                  required
                  className="bg-slate-100 border-slate-200 text-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="twofa" className="text-slate-700">Senha 2FA (se houver)</Label>
                <Input
                  id="twofa"
                  type="password"
                  value={twoFaPassword}
                  onChange={(e) => setTwoFaPassword(e.target.value)}
                  placeholder="Deixe vazio se a conta não tem 2FA"
                  className="bg-slate-100 border-slate-200 text-slate-900"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={verifying}
                  className="bg-primary-600 hover:bg-primary-700 text-white"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    "Verificar e conectar"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPhoneCodeHash(null);
                    setCode("");
                    setTwoFaPassword("");
                  }}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900">Limite de provisionamento</CardTitle>
          <CardDescription className="text-slate-500">
            Máximo de bots criados por hora pela conta Telegram acima.
            Protege contra rate limit do @BotFather. Excedentes ficam em fila
            e são processados nas próximas horas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveRate} className="flex items-end gap-3 max-w-sm">
            <div className="space-y-2 flex-1">
              <Label htmlFor="rate" className="text-slate-700">Máximo por hora</Label>
              <Input
                id="rate"
                type="number"
                min={1}
                max={500}
                value={maxPerHour}
                onChange={(e) => setMaxPerHour(e.target.value)}
                className="bg-slate-100 border-slate-200 text-slate-900"
              />
            </div>
            <Button
              type="submit"
              disabled={savingRate}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {savingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      </section>

      {/* ------------------------------------------------------------ */}
      {/* SEÇÃO 2: Integração com TopFans (endpoint público + secret)  */}
      {/* ------------------------------------------------------------ */}
      <section className="space-y-4">
        <div className="flex items-start gap-3 border-b border-slate-200 pb-3">
          <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
            <Plug className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Integração com TopFans
            </h2>
            <p className="text-sm text-slate-500">
              Endpoint público que a plataforma TopFans chama pra solicitar
              criação de bots BotFans. Autenticação via shared secret.
            </p>
          </div>
        </div>

      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-slate-900">Secret de integração</CardTitle>
          <CardDescription className="text-slate-500">
            Shared secret enviado pela TopFans no header{" "}
            <code className="bg-slate-100 px-1 rounded">Authorization: Bearer &lt;secret&gt;</code>.
            Gere um novo ao rotacionar — valor exibido apenas uma vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {newSecret && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800">
                Copie o secret agora — não será exibido novamente.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-amber-200 rounded px-2 py-1 text-xs text-slate-900 break-all">
                  {newSecret}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={copySecret}
                  className="border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={rotating}
            onClick={handleRotateSecret}
            className="border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {rotating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Gerar novo secret
          </Button>
        </CardContent>
      </Card>
      </section>
    </div>
  );
}
