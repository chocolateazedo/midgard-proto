"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  ImageIcon,
  Link as LinkIcon,
  Crown,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listRecoveryMessages,
  upsertRecoveryMessage,
  setRecoveryMessageActive,
  deleteRecoveryMessage,
  listSubscriptionPlansForBot,
  type RecoveryMessageSummary,
  type RecoveryTriggerType,
  type RecoveryStepTriggerParams,
  type RecoveryStepContent,
  type RecoveryStepVariant,
  type RecoveryStepButton,
  type RecoveryMessageFrequency,
  type SubscriptionPlanOption,
} from "@/server/actions/recovery.actions";

interface RecoveryClientProps {
  botId: string;
}

const TRIGGER_LABELS: Record<RecoveryTriggerType, string> = {
  time_after_first_seen: "Após primeiro contato",
  cart_abandoned: "Carrinho abandonado",
  subscription_ending: "Assinatura vencendo",
  winback: "Winback (assinatura expirada)",
  no_active_subscription: "Sem assinatura vigente",
};

function describeTrigger(
  type: RecoveryTriggerType,
  params: RecoveryStepTriggerParams,
): string {
  switch (type) {
    case "time_after_first_seen":
      return `${params.delayMinutes ?? 0} min após /start sem assinar`;
    case "cart_abandoned":
      return `${params.delayMinutes ?? 0} min após gerar Pix sem pagar`;
    case "subscription_ending":
      return `${params.daysBefore ?? 0} dia(s) antes de vencer`;
    case "winback":
      return `${params.daysAfter ?? 0} dia(s) após expirar`;
    case "no_active_subscription":
      return "Todos sem assinatura vigente";
  }
}

function describeFrequency(m: RecoveryMessageSummary): string {
  if (m.frequency === "once") return "Única";
  const min = m.recurringIntervalMinutes ?? 0;
  if (min < 60) return `A cada ${min} min`;
  if (min % 60 === 0) return `A cada ${min / 60}h`;
  return `A cada ${(min / 60).toFixed(1)}h`;
}

export function RecoveryClient({ botId }: RecoveryClientProps) {
  const [messages, setMessages] = useState<RecoveryMessageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMessage, setEditingMessage] =
    useState<RecoveryMessageSummary | "new" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await listRecoveryMessages(botId);
    if (r.success && r.data) setMessages(r.data);
    else toast.error(r.error ?? "Erro ao carregar mensagens");
    setLoading(false);
  }, [botId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() => setEditingMessage("new")}
          className="bg-primary-600 hover:bg-primary-700 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova mensagem
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : messages.length === 0 ? (
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="py-12 text-center">
            <p className="text-slate-700 font-medium">Nenhuma mensagem ainda</p>
            <p className="text-sm text-slate-500 mt-1">
              Crie uma mensagem pra começar a recuperar usuários que não assinam.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const firstVariant = m.content.variants?.[0];
            const variantCount = m.content.variants?.length ?? 0;
            return (
              <Card key={m.id} className="bg-white border-slate-200/60 rounded-xl">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-medium text-slate-900 truncate">
                        {m.name}
                      </p>
                      <Badge
                        variant="outline"
                        className={
                          m.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : "bg-slate-100 text-slate-500 border-slate-300"
                        }
                      >
                        {m.isActive ? "Ativa" : "Inativa"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {TRIGGER_LABELS[m.triggerType]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          m.frequency === "recurring"
                            ? "bg-blue-50 text-blue-700 border-blue-300 text-xs"
                            : "bg-slate-50 text-slate-600 border-slate-300 text-xs"
                        }
                      >
                        {describeFrequency(m)}
                      </Badge>
                      {variantCount > 1 && (
                        <Badge variant="outline" className="text-xs">
                          {variantCount} variantes
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mb-1">
                      {describeTrigger(m.triggerType, m.triggerParams)}
                    </p>
                    {firstVariant && (
                      <p className="text-sm text-slate-700 line-clamp-2">
                        {firstVariant.text}
                      </p>
                    )}
                    <div className="flex gap-3 text-xs text-slate-400 mt-1">
                      <span>{m.sentCount} envio(s)</span>
                      <span>{m.convertedCount} conversão(ões)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await setRecoveryMessageActive(
                          m.id,
                          !m.isActive,
                        );
                        if (r.success) {
                          toast.success(m.isActive ? "Inativada" : "Ativada");
                          reload();
                        } else toast.error(r.error ?? "Erro");
                      }}
                    >
                      {m.isActive ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingMessage(m)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteId(m.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <MessageEditorDialog
        botId={botId}
        editing={editingMessage}
        onClose={() => setEditingMessage(null)}
        onSaved={() => {
          setEditingMessage(null);
          reload();
        }}
      />

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Apaga a mensagem e os logs de envio. Não pode desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (!deleteId) return;
                const r = await deleteRecoveryMessage(deleteId);
                if (r.success) {
                  toast.success("Mensagem excluída");
                  reload();
                } else toast.error(r.error ?? "Erro");
                setDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface EditorState {
  name: string;
  triggerType: RecoveryTriggerType;
  delayMinutes: string;
  daysBefore: string;
  daysAfter: string;
  frequency: RecoveryMessageFrequency;
  intervalMinutes: string;
  variants: RecoveryStepVariant[];
  buttons: RecoveryStepButton[];
}

function emptyState(): EditorState {
  return {
    name: "",
    triggerType: "time_after_first_seen",
    delayMinutes: "60",
    daysBefore: "3",
    daysAfter: "7",
    frequency: "once",
    intervalMinutes: "120",
    variants: [{ text: "", mediaKey: null, mediaType: null }],
    buttons: [],
  };
}

function MessageEditorDialog({
  botId,
  editing,
  onClose,
  onSaved,
}: {
  botId: string;
  editing: RecoveryMessageSummary | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [s, setS] = useState<EditorState>(emptyState());
  const [plans, setPlans] = useState<SubscriptionPlanOption[]>([]);
  const [saving, startSaving] = useTransition();

  const open = !!editing;
  const isEditing = editing && editing !== "new";

  useEffect(() => {
    if (!open) return;
    listSubscriptionPlansForBot(botId).then((r) => {
      if (r.success && r.data) setPlans(r.data);
    });
  }, [botId, open]);

  useEffect(() => {
    if (editing && editing !== "new") {
      const variants = editing.content.variants?.length
        ? editing.content.variants
        : [{ text: "", mediaKey: null, mediaType: null }];
      setS({
        name: editing.name,
        triggerType: editing.triggerType,
        delayMinutes: String(editing.triggerParams.delayMinutes ?? 60),
        daysBefore: String(editing.triggerParams.daysBefore ?? 3),
        daysAfter: String(editing.triggerParams.daysAfter ?? 7),
        frequency: editing.frequency,
        intervalMinutes: String(editing.recurringIntervalMinutes ?? 120),
        variants,
        buttons: editing.content.buttons ?? [],
      });
    } else if (editing === "new") {
      setS(emptyState());
    }
  }, [editing]);

  function patch(p: Partial<EditorState>) {
    setS((prev) => ({ ...prev, ...p }));
  }

  function updateVariant(idx: number, p: Partial<RecoveryStepVariant>) {
    setS((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === idx ? { ...v, ...p } : v)),
    }));
  }

  function addVariant() {
    setS((prev) => ({
      ...prev,
      variants: [...prev.variants, { text: "", mediaKey: null, mediaType: null }],
    }));
  }

  function removeVariant(idx: number) {
    setS((prev) => ({
      ...prev,
      variants:
        prev.variants.length > 1
          ? prev.variants.filter((_, i) => i !== idx)
          : prev.variants,
    }));
  }

  function updateButton(idx: number, b: RecoveryStepButton) {
    setS((prev) => ({
      ...prev,
      buttons: prev.buttons.map((x, i) => (i === idx ? b : x)),
    }));
  }

  function addButton() {
    setS((prev) => ({
      ...prev,
      buttons: [
        ...prev.buttons,
        { text: "", action: { type: "link", url: "https://" } },
      ],
    }));
  }

  function removeButton(idx: number) {
    setS((prev) => ({
      ...prev,
      buttons: prev.buttons.filter((_, i) => i !== idx),
    }));
  }

  const buildParams = (): RecoveryStepTriggerParams => {
    switch (s.triggerType) {
      case "time_after_first_seen":
      case "cart_abandoned":
        return { delayMinutes: parseInt(s.delayMinutes, 10) || 0 };
      case "subscription_ending":
        return { daysBefore: parseInt(s.daysBefore, 10) || 0 };
      case "winback":
        return { daysAfter: parseInt(s.daysAfter, 10) || 0 };
      case "no_active_subscription":
        return {};
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar mensagem" : "Nova mensagem"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input
              value={s.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Ex: Lembrete 1h após /start"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Trigger</Label>
              <Select
                value={s.triggerType}
                onValueChange={(v) =>
                  patch({ triggerType: v as RecoveryTriggerType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Frequência</Label>
              <Select
                value={s.frequency}
                onValueChange={(v) => {
                  const freq = v as RecoveryMessageFrequency;
                  patch({
                    frequency: freq,
                    // Mudou pra once → garante 1 variante
                    variants:
                      freq === "once" && s.variants.length > 1
                        ? [s.variants[0]]
                        : s.variants,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Única</SelectItem>
                  <SelectItem value="recurring">Recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(s.triggerType === "time_after_first_seen" ||
            s.triggerType === "cart_abandoned") && (
            <div>
              <Label>Tempo (minutos)</Label>
              <Input
                type="number"
                min="1"
                value={s.delayMinutes}
                onChange={(e) => patch({ delayMinutes: e.target.value })}
              />
            </div>
          )}
          {s.triggerType === "subscription_ending" && (
            <div>
              <Label>Dias antes de vencer</Label>
              <Input
                type="number"
                min="1"
                value={s.daysBefore}
                onChange={(e) => patch({ daysBefore: e.target.value })}
              />
            </div>
          )}
          {s.triggerType === "winback" && (
            <div>
              <Label>Dias após expirar</Label>
              <Input
                type="number"
                min="1"
                value={s.daysAfter}
                onChange={(e) => patch({ daysAfter: e.target.value })}
              />
            </div>
          )}

          {s.frequency === "recurring" && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-2">
              <div>
                <Label>Intervalo entre envios (minutos)</Label>
                <Input
                  type="number"
                  min="5"
                  value={s.intervalMinutes}
                  onChange={(e) => patch({ intervalMinutes: e.target.value })}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Recorrente envia somente entre 8h e 22h (Brasília) pra não
                  acordar usuário.
                </p>
              </div>
            </div>
          )}

          <div>
            <Label className="flex items-center justify-between">
              Mensagens
              {s.frequency === "recurring" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addVariant}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Adicionar variante
                </Button>
              )}
            </Label>
            <p className="text-xs text-slate-500 mb-2">
              {s.frequency === "recurring" && s.variants.length > 1
                ? `Round-robin: a cada disparo envia a próxima da lista (1 → 2 → ${
                    s.variants.length
                  } → 1...)`
                : "Variáveis: {nome}, {produtor}, {plano_mais_barato}"}
            </p>

            <div className="space-y-3">
              {s.variants.map((v, i) => (
                <VariantEditor
                  key={i}
                  index={i}
                  total={s.variants.length}
                  variant={v}
                  botId={botId}
                  onUpdate={(p) => updateVariant(i, p)}
                  onRemove={
                    s.variants.length > 1 ? () => removeVariant(i) : undefined
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="flex items-center justify-between">
              Botões (opcional)
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addButton}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar botão
              </Button>
            </Label>
            {s.buttons.length === 0 ? (
              <p className="text-xs text-slate-500 mt-1">
                Sem botões. Adicione pra incluir link externo ou botão de
                assinatura.
              </p>
            ) : (
              <div className="space-y-2 mt-2">
                {s.buttons.map((b, i) => (
                  <ButtonEditor
                    key={i}
                    button={b}
                    plans={plans}
                    onUpdate={(nb) => updateButton(i, nb)}
                    onRemove={() => removeButton(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !s.name.trim()}
            onClick={() => {
              const content: RecoveryStepContent = {
                variants: s.variants,
                buttons: s.buttons.length > 0 ? s.buttons : undefined,
              };
              const interval =
                s.frequency === "recurring"
                  ? parseInt(s.intervalMinutes, 10) || 0
                  : null;
              startSaving(async () => {
                const r = await upsertRecoveryMessage(botId, {
                  messageId:
                    editing && editing !== "new" ? editing.id : undefined,
                  name: s.name,
                  triggerType: s.triggerType,
                  triggerParams: buildParams(),
                  content,
                  frequency: s.frequency,
                  recurringIntervalMinutes: interval,
                });
                if (r.success) {
                  toast.success("Mensagem salva");
                  onSaved();
                } else toast.error(r.error ?? "Erro");
              });
            }}
            className="bg-primary-600 hover:bg-primary-700 text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VariantEditor({
  index,
  total,
  variant,
  botId,
  onUpdate,
  onRemove,
}: {
  index: number;
  total: number;
  variant: RecoveryStepVariant;
  botId: string;
  onUpdate: (p: Partial<RecoveryStepVariant>) => void;
  onRemove?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputId = `variant-media-${index}`;

  async function handleSelect(file: File) {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast.error("Selecione imagem ou vídeo");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo > 50 MB");
      return;
    }
    setUploading(true);
    try {
      const presignedRes = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          botId,
        }),
      });
      const presignedData = await presignedRes.json();
      if (!presignedData.success) {
        toast.error(presignedData.error ?? "Erro");
        return;
      }
      const { url, key } = presignedData.data as { url: string; key: string };
      const uploadRes = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) {
        toast.error("Falha no upload");
        return;
      }
      onUpdate({ mediaKey: key, mediaType: isVideo ? "video" : "photo" });
      toast.success("Mídia enviada");
    } catch (e) {
      console.error(e);
      toast.error("Erro no upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-medium">
          Variante {index + 1}
          {total > 1 ? ` / ${total}` : ""}
        </span>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 h-7"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <Textarea
        value={variant.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        rows={3}
        placeholder="Texto da mensagem..."
      />
      {variant.mediaKey ? (
        <div className="rounded-lg bg-white border border-slate-200 p-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-xs font-mono text-slate-700 truncate">
              {variant.mediaKey}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 h-7 shrink-0"
            onClick={() => onUpdate({ mediaKey: null, mediaType: null })}
          >
            Remover
          </Button>
        </div>
      ) : (
        <>
          <input
            id={inputId}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleSelect(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={uploading}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <ImageIcon className="h-3.5 w-3.5 mr-2" />
                Adicionar foto/vídeo
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}

function ButtonEditor({
  button,
  plans,
  onUpdate,
  onRemove,
}: {
  button: RecoveryStepButton;
  plans: SubscriptionPlanOption[];
  onUpdate: (b: RecoveryStepButton) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={button.text}
          onChange={(e) => onUpdate({ ...button, text: e.target.value })}
          placeholder="Texto do botão"
          className="flex-1"
        />
        <Select
          value={button.action.type}
          onValueChange={(v) => {
            if (v === "link") {
              onUpdate({
                ...button,
                action: { type: "link", url: "https://" },
              });
            } else {
              onUpdate({
                ...button,
                action: { type: "subscribe_plan", planId: plans[0]?.id ?? "" },
              });
            }
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="link">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-3.5 w-3.5" />
                Link externo
              </div>
            </SelectItem>
            <SelectItem value="subscribe_plan">
              <div className="flex items-center gap-2">
                <Crown className="h-3.5 w-3.5" />
                Assinar plano
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-600 hover:bg-red-50"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {button.action.type === "link" ? (
        <Input
          value={button.action.url}
          onChange={(e) =>
            onUpdate({ ...button, action: { type: "link", url: e.target.value } })
          }
          placeholder="https://exemplo.com"
        />
      ) : (
        <Select
          value={button.action.planId}
          onValueChange={(planId) =>
            onUpdate({ ...button, action: { type: "subscribe_plan", planId } })
          }
        >
          <SelectTrigger>
            <SelectValue
              placeholder={plans.length === 0 ? "Sem planos ativos" : "Selecione plano"}
            />
          </SelectTrigger>
          <SelectContent>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} — R$ {p.price.toFixed(2).replace(".", ",")} /{" "}
                {p.durationDays}d
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
