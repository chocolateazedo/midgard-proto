"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Radio, Video } from "lucide-react";

import { getLiveStream, upsertLiveStream } from "@/server/actions/live.actions";
import { getSubscriptionPlans } from "@/server/actions/subscription-plan.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SubscriptionPlan } from "@/types";

interface LiveTabProps {
  botId: string;
}

export function LiveTab({ botId }: LiveTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [isLive, setIsLive] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [streamLink, setStreamLink] = useState("");
  const [notifySubscribers, setNotifySubscribers] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  const load = useCallback(async () => {
    try {
      const [liveResult, plansResult] = await Promise.all([
        getLiveStream(botId),
        getSubscriptionPlans(botId),
      ]);

      if (liveResult.success && liveResult.data) {
        const live = liveResult.data;
        setIsLive(live.isLive);
        setTitle(live.title ?? "");
        setDescription(live.description ?? "");
        setPrice(parseFloat(live.price.toString()).toString());
        setStreamLink(live.streamLink ?? "");
        setNotifySubscribers(live.notifySubscribers);
      }

      if (plansResult.success && plansResult.data) {
        setPlans(plansResult.data);
      }
    } catch {
      toast.error("Erro ao carregar configuração de live");
    } finally {
      setIsLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await upsertLiveStream(botId, {
        isLive,
        title: title || undefined,
        description: description || undefined,
        price: parseFloat(price) || 0,
        streamLink: streamLink || undefined,
        notifySubscribers,
      });
      if (!result.success) {
        toast.error(result.error ?? "Erro ao salvar");
        return;
      }
      toast.success(
        isLive
          ? "Live ativada! Usuários podem acessar via /live."
          : "Configuração de live salva!"
      );
    } catch {
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const activePlansWithLive = plans.filter((p) => p.isActive && p.includesLiveAccess);

  return (
    <div className="space-y-6">
      {/* Status da live */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <Video className="h-4 w-4" />
            Transmissão ao Vivo
          </CardTitle>
          <CardDescription className="text-slate-400">
            Ative quando estiver transmitindo para que seus seguidores saibam
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Toggle principal */}
          <div
            className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
              isLive
                ? "border-red-300 bg-red-50/50"
                : "border-slate-200 bg-slate-50/50"
            }`}
          >
            <div className="flex items-center gap-3">
              {isLive && (
                <Radio className="h-5 w-5 text-red-500 animate-pulse" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {isLive ? "AO VIVO" : "Offline"}
                </p>
                <p className="text-xs text-slate-400">
                  {isLive
                    ? "Usuários verão um banner e podem acessar via /live"
                    : "Ative quando iniciar a transmissão"}
                </p>
              </div>
            </div>
            <Switch
              checked={isLive}
              onCheckedChange={setIsLive}
            />
          </div>

          {/* Configurações */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-700">Título da Live</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Live especial de hoje — 21h"
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700">Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição da transmissão..."
                rows={2}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700">Link da Transmissão</Label>
              <Input
                value={streamLink}
                onChange={(e) => setStreamLink(e.target.value)}
                placeholder="https://youtube.com/live/... ou link do Zoom, etc."
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400"
              />
              <p className="text-xs text-slate-400">
                Link privado que será entregue aos usuários após pagamento (ou gratuitamente)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700">Preço de Acesso (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400"
              />
              <p className="text-xs text-slate-400">
                Deixe R$ 0,00 para acesso gratuito a todos os usuários
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <p className="text-sm text-slate-700">Notificar seguidores</p>
                <p className="text-xs text-slate-400">
                  Envia mensagem a todos os usuários do bot ao ativar a live
                </p>
              </div>
              <Switch
                checked={notifySubscribers}
                onCheckedChange={setNotifySubscribers}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Planos com acesso à live */}
      {activePlansWithLive.length > 0 && (
        <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
          <CardHeader>
            <CardTitle className="text-base text-slate-900">
              Planos com Acesso Gratuito à Live
            </CardTitle>
            <CardDescription className="text-slate-400">
              Assinantes destes planos acessam sem pagar extra
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activePlansWithLive.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-center gap-2 rounded bg-violet-50 px-3 py-2 text-sm text-violet-700"
                >
                  <span className="text-violet-500">&#10003;</span>
                  {plan.name}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Para alterar, edite os planos na aba &quot;Planos&quot; e ative/desative o toggle
              &quot;Inclui acesso à live&quot;.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Salvar */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar Configuração"
          )}
        </Button>
      </div>
    </div>
  );
}
