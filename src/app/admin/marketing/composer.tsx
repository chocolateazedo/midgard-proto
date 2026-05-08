"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Image as ImageIcon,
  Link as LinkIcon,
  Send,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  upsertCampaign,
  startCampaign,
  listCreatorsForSegmentation,
  getCampaign,
  getBroadcastMediaPreviewUrl,
  type BroadcastButton,
  type BroadcastContent,
  type BroadcastSegmentation,
} from "@/server/actions/broadcast.actions";

interface ComposerProps {
  campaignId?: string; // se preenchido = edit mode
}

export function CampaignComposer({ campaignId }: ComposerProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [mediaKey, setMediaKey] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"photo" | "video" | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [buttons, setButtons] = useState<BroadcastButton[]>([]);
  const [segmentTarget, setSegmentTarget] = useState<"all" | "creators">("all");
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [creators, setCreators] = useState<
    Array<{ id: string; name: string; email: string; botCount: number }>
  >([]);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [saving, startSaving] = useTransition();
  const [starting, startStarting] = useTransition();

  // Load creators + campaign data on mount
  useEffect(() => {
    listCreatorsForSegmentation().then((r) => {
      if (r.success && r.data) setCreators(r.data);
    });
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    getCampaign(campaignId).then((r) => {
      if (!r.success || !r.data) {
        toast.error(r.error ?? "Erro ao carregar");
        return;
      }
      const c = r.data;
      setTitle(c.title);
      setText(c.content.text ?? "");
      setMediaKey(c.content.mediaKey ?? null);
      setMediaType(c.content.mediaType ?? null);
      setButtons(c.content.buttons ?? []);
      const seg = c.segmentation;
      if (seg.creatorIds && seg.creatorIds.length > 0) {
        setSegmentTarget("creators");
        setSelectedCreators(seg.creatorIds);
      } else {
        setSegmentTarget("all");
      }
      if (c.scheduledFor) {
        setScheduleMode("later");
        const d = new Date(c.scheduledFor);
        const tzOffset = d.getTimezoneOffset() * 60000;
        setScheduleDateTime(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
      }
    });
  }, [campaignId]);

  // Load preview URL when mediaKey changes
  useEffect(() => {
    if (!mediaKey) {
      setMediaPreviewUrl(null);
      return;
    }
    getBroadcastMediaPreviewUrl(mediaKey).then((r) => {
      if (r.success && r.data) setMediaPreviewUrl(r.data.url);
    });
  }, [mediaKey]);

  async function handleMediaSelect(file: File) {
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
    setUploadingMedia(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/broadcast-media", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "Erro no upload");
        return;
      }
      const { key, mediaType: mt, originalSize, finalSize } = data.data;
      setMediaKey(key);
      setMediaType(mt);
      const sizeMsg =
        mt === "photo" && finalSize < originalSize
          ? `Mídia enviada (${(originalSize / 1024 / 1024).toFixed(1)}→${(finalSize / 1024 / 1024).toFixed(1)} MB)`
          : "Mídia enviada";
      toast.success(sizeMsg);
    } catch (e) {
      console.error(e);
      toast.error("Erro no upload");
    } finally {
      setUploadingMedia(false);
    }
  }

  function addButton() {
    setButtons((prev) => [
      ...prev,
      { text: "", action: { type: "link", url: "https://" } },
    ]);
  }
  function updateButton(idx: number, b: BroadcastButton) {
    setButtons((prev) => prev.map((x, i) => (i === idx ? b : x)));
  }
  function removeButton(idx: number) {
    setButtons((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleCreator(id: string) {
    setSelectedCreators((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function buildPayload(): { content: BroadcastContent; segmentation: BroadcastSegmentation; scheduledFor: Date | null } {
    const content: BroadcastContent = {
      text: text.trim(),
      mediaKey: mediaKey ?? null,
      mediaType: mediaType ?? null,
      buttons: buttons.length > 0 ? buttons : undefined,
    };
    const segmentation: BroadcastSegmentation =
      segmentTarget === "creators" && selectedCreators.length > 0
        ? { creatorIds: selectedCreators }
        : {};
    let scheduledFor: Date | null = null;
    if (scheduleMode === "later" && scheduleDateTime) {
      scheduledFor = new Date(scheduleDateTime);
    }
    return { content, segmentation, scheduledFor };
  }

  async function handleSave(thenStart: boolean) {
    if (!title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    if (segmentTarget === "creators" && selectedCreators.length === 0) {
      toast.error("Selecione ao menos um creator");
      return;
    }
    const payload = buildPayload();
    startSaving(async () => {
      const r = await upsertCampaign({
        campaignId,
        title,
        ...payload,
      });
      if (!r.success || !r.data) {
        toast.error(r.error ?? "Erro ao salvar");
        return;
      }
      const id = r.data.campaignId;
      toast.success("Salvo");
      if (thenStart) {
        startStarting(async () => {
          const sr = await startCampaign(id);
          if (sr.success) {
            toast.success("Envio iniciado");
            router.push(`/admin/marketing/${id}`);
          } else toast.error(sr.error ?? "Erro ao iniciar");
        });
      } else {
        router.push("/admin/marketing");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="text-slate-500">
          <Link href="/admin/marketing">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary-600" />
          {campaignId ? "Editar campanha" : "Nova campanha"}
        </h1>
      </div>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Conteúdo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Título (interno)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Anúncio canal novo"
            />
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Texto da mensagem (suporta Markdown do Telegram)"
            />
          </div>
          <div>
            <Label>Mídia (opcional)</Label>
            {mediaKey ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                <div className="h-20 w-20 shrink-0 bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                  {mediaPreviewUrl ? (
                    mediaType === "video" ? (
                      <video src={mediaPreviewUrl} className="h-full w-full object-cover" muted playsInline />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaPreviewUrl} alt="preview" className="h-full w-full object-cover" />
                    )
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 capitalize">
                    {mediaType === "video" ? "Vídeo" : "Foto"}
                  </p>
                  <p className="text-xs font-mono text-slate-700 truncate">{mediaKey}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setMediaKey(null);
                    setMediaType(null);
                  }}
                >
                  Remover
                </Button>
              </div>
            ) : (
              <div className="mt-1">
                <input
                  id="broadcast-media-input"
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  disabled={uploadingMedia}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleMediaSelect(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={uploadingMedia}
                  onClick={() =>
                    document.getElementById("broadcast-media-input")?.click()
                  }
                >
                  {uploadingMedia ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Adicionar foto ou vídeo (≤1 min)
                    </>
                  )}
                </Button>
                <p className="text-xs text-slate-500 mt-1">
                  Imagem comprimida automaticamente. Vídeo até 60s.
                </p>
              </div>
            )}
          </div>
          <div>
            <Label className="flex items-center justify-between">
              Botões (opcional)
              <Button type="button" variant="outline" size="sm" onClick={addButton}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </Button>
            </Label>
            {buttons.length === 0 ? (
              <p className="text-xs text-slate-500 mt-1">
                Sem botões. Adicione link externo ou link de canal Telegram.
              </p>
            ) : (
              <div className="space-y-2 mt-2">
                {buttons.map((b, i) => (
                  <ButtonRow
                    key={i}
                    button={b}
                    onUpdate={(nb) => updateButton(i, nb)}
                    onRemove={() => removeButton(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Audiência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Quem recebe</Label>
            <Select
              value={segmentTarget}
              onValueChange={(v) => setSegmentTarget(v as "all" | "creators")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os usuários da plataforma</SelectItem>
                <SelectItem value="creators">Por criador (multi-select)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {segmentTarget === "creators" && (
            <div>
              <Label>Selecione os creators</Label>
              <div className="rounded-lg border border-slate-200 max-h-60 overflow-y-auto divide-y divide-slate-100">
                {creators.length === 0 ? (
                  <p className="text-sm text-slate-500 p-3">
                    Nenhum creator ativo encontrado.
                  </p>
                ) : (
                  creators.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 p-2.5 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCreators.includes(c.id)}
                        onChange={() => toggleCreator(c.id)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 truncate">{c.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {c.email} · {c.botCount} bot(s)
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {selectedCreators.length} creator(s) selecionado(s).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Envio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Quando enviar</Label>
            <Select value={scheduleMode} onValueChange={(v) => setScheduleMode(v as "now" | "later")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="now">Imediatamente</SelectItem>
                <SelectItem value="later">Agendar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scheduleMode === "later" && (
            <div>
              <Label>Data e hora</Label>
              <Input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={() => handleSave(false)}
          disabled={saving || starting}
        >
          {saving && !starting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Salvar rascunho
        </Button>
        <Button
          onClick={() => handleSave(true)}
          disabled={saving || starting}
          className="bg-primary-600 hover:bg-primary-700 text-white"
        >
          {(saving || starting) && (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          )}
          <Send className="h-4 w-4 mr-1" />
          {scheduleMode === "later" ? "Salvar e agendar" : "Enviar agora"}
        </Button>
      </div>
    </div>
  );
}

function ButtonRow({
  button,
  onUpdate,
  onRemove,
}: {
  button: BroadcastButton;
  onUpdate: (b: BroadcastButton) => void;
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
            if (v === "link" || v === "channel") {
              onUpdate({ ...button, action: { type: v, url: button.action.url } });
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
            <SelectItem value="channel">
              <div className="flex items-center gap-2">
                <Send className="h-3.5 w-3.5" />
                Canal Telegram
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Input
        value={button.action.url}
        onChange={(e) => onUpdate({ ...button, action: { type: button.action.type, url: e.target.value } })}
        placeholder={
          button.action.type === "channel"
            ? "https://t.me/seucanal ou https://t.me/+invitecode"
            : "https://exemplo.com"
        }
      />
    </div>
  );
}
