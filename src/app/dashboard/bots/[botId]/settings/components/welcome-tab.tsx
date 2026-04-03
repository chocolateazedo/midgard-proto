"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ExternalLink, MessageSquare } from "lucide-react";

import { getWelcomeMessage, upsertWelcomeMessage } from "@/server/actions/welcome.actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WelcomeButton {
  text: string;
  action: string;
}

interface WelcomeTabProps {
  botId: string;
}

export function WelcomeTab({ botId }: WelcomeTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [text, setText] = useState("");
  const [sendOnEveryStart, setSendOnEveryStart] = useState(true);
  const [buttons, setButtons] = useState<WelcomeButton[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const result = await getWelcomeMessage(botId);
        if (result.success && result.data) {
          setText(result.data.text);
          setSendOnEveryStart(result.data.sendOnEveryStart);
          setButtons((result.data.buttons as unknown as WelcomeButton[]) ?? []);
        }
      } catch {
        toast.error("Erro ao carregar mensagem de boas-vindas");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [botId]);

  async function handleSave() {
    if (!text.trim()) {
      toast.error("A mensagem é obrigatória");
      return;
    }

    setIsSaving(true);
    try {
      const result = await upsertWelcomeMessage(botId, {
        text,
        sendOnEveryStart,
        buttons,
      });
      if (!result.success) {
        toast.error(result.error ?? "Erro ao salvar");
        return;
      }
      toast.success("Mensagem de boas-vindas salva!");
    } catch {
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  function addButton() {
    if (buttons.length >= 6) {
      toast.error("Máximo de 6 botões");
      return;
    }
    setButtons([...buttons, { text: "", action: "command:/catalogo" }]);
  }

  function updateButton(index: number, field: keyof WelcomeButton, value: string) {
    const updated = [...buttons];
    updated[index] = { ...updated[index], [field]: value };
    setButtons(updated);
  }

  function removeButton(index: number) {
    setButtons(buttons.filter((_, i) => i !== index));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mensagem */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Mensagem de Boas-Vindas
          </CardTitle>
          <CardDescription className="text-slate-400">
            Mensagem enviada quando o usuário envia /start no bot
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-slate-700">Texto da Mensagem</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Bem-vindo ao nosso canal! 🎉&#10;&#10;Aqui você encontra conteúdo exclusivo..."
              className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400 resize-none"
            />
            <p className="text-xs text-slate-400">
              Suporta Markdown do Telegram: *negrito*, _itálico_, `código`, [link](url)
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div>
              <p className="text-sm text-slate-700">Enviar em todo /start</p>
              <p className="text-xs text-slate-400">
                Se desativado, envia apenas no primeiro contato do usuário
              </p>
            </div>
            <Switch
              checked={sendOnEveryStart}
              onCheckedChange={setSendOnEveryStart}
            />
          </div>
        </CardContent>
      </Card>

      {/* Botões inline */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Botões Inline</CardTitle>
          <CardDescription className="text-slate-400">
            Botões exibidos abaixo da mensagem de boas-vindas (máx. 6)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {buttons.map((btn, index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3"
            >
              <div className="flex-1 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Texto do botão</Label>
                  <Input
                    value={btn.text}
                    onChange={(e) => updateButton(index, "text", e.target.value)}
                    placeholder="Ver catálogo"
                    className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Ação</Label>
                  <Select
                    value={btn.action.startsWith("url:") ? "url" : "command"}
                    onValueChange={(type) => {
                      if (type === "url") {
                        updateButton(index, "action", "url:https://");
                      } else {
                        updateButton(index, "action", "command:/catalogo");
                      }
                    }}
                  >
                    <SelectTrigger className="border-slate-200 bg-white text-slate-900 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="command">Comando do bot</SelectItem>
                      <SelectItem value="url">Link externo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">
                    {btn.action.startsWith("url:") ? "URL" : "Comando"}
                  </Label>
                  {btn.action.startsWith("url:") ? (
                    <Input
                      value={btn.action.replace("url:", "")}
                      onChange={(e) => updateButton(index, "action", `url:${e.target.value}`)}
                      placeholder="https://exemplo.com"
                      className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 h-9 text-sm"
                    />
                  ) : (
                    <Select
                      value={btn.action.replace("command:", "")}
                      onValueChange={(cmd) => updateButton(index, "action", `command:${cmd}`)}
                    >
                      <SelectTrigger className="border-slate-200 bg-white text-slate-900 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="/catalogo">
                          /catalogo — Ver catálogo
                        </SelectItem>
                        <SelectItem value="/planos">
                          /planos — Ver planos
                        </SelectItem>
                        <SelectItem value="/live">
                          /live — Transmissão ao vivo
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeButton(index)}
                className="text-slate-400 hover:text-red-500 mt-5"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {buttons.length < 6 && (
            <Button
              variant="outline"
              onClick={addButton}
              className="w-full border-dashed border-slate-300 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Botão
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Preview</CardTitle>
          <CardDescription className="text-slate-400">
            Visualização aproximada de como a mensagem aparecerá no Telegram
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-slate-800 p-4 text-white">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {text || "Sua mensagem aparecerá aqui..."}
            </div>
            {buttons.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {buttons.map((btn, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-center gap-1.5 rounded bg-slate-700/80 px-3 py-2 text-sm text-blue-300"
                  >
                    {btn.action.startsWith("url:") && (
                      <ExternalLink className="h-3 w-3" />
                    )}
                    {btn.text || "Botão sem texto"}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Salvar */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving || !text.trim()}
          className="bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar Boas-Vindas"
          )}
        </Button>
      </div>
    </div>
  );
}
