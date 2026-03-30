"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Image as ImageIcon,
  Video,
  File,
  Package,
  MoreVertical,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";

import { createContent, deleteContent, togglePublish, updateContent } from "@/server/actions/content.actions";
// Use a serialized Content type (price/totalRevenue as number, not Decimal)
type SerializedContent = {
  id: string;
  botId: string;
  userId: string;
  title: string;
  description: string | null;
  type: "image" | "video" | "file" | "bundle";
  price: number;
  originalKey: string;
  previewKey: string | null;
  originalUrl: string | null;
  previewUrl: string | null;
  isPublished: boolean | null;
  purchaseCount: number | null;
  totalRevenue: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type ContentItem = SerializedContent & {
  bot?: { id: string; name: string; username: string | null } | null;
};

interface ContentGridProps {
  botId: string;
  initialContent: ContentItem[];
}

function getContentIcon(type: string) {
  switch (type) {
    case "image":
      return <ImageIcon className="h-8 w-8 text-violet-400" />;
    case "video":
      return <Video className="h-8 w-8 text-blue-400" />;
    case "bundle":
      return <Package className="h-8 w-8 text-amber-400" />;
    default:
      return <File className="h-8 w-8 text-zinc-400" />;
  }
}

function getContentTypeBg(type: string) {
  switch (type) {
    case "image":
      return "bg-violet-500/10";
    case "video":
      return "bg-blue-500/10";
    case "bundle":
      return "bg-amber-500/10";
    default:
      return "bg-zinc-500/10";
  }
}

function getContentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    image: "Imagem",
    video: "Vídeo",
    file: "Arquivo",
    bundle: "Bundle",
  };
  return labels[type] ?? type;
}

function detectContentType(mimeType: string): "image" | "video" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

interface UploadFormData {
  title: string;
  description: string;
  price: string;
  isPublished: boolean;
  file: File | null;
}

export function ContentGrid({ botId, initialContent }: ContentGridProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const [form, setForm] = useState<UploadFormData>({
    title: "",
    description: "",
    price: "",
    isPublished: false,
    file: null,
  });

  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    price: "",
    isPublished: false,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  function resetForm() {
    setForm({ title: "", description: "", price: "", isPublished: false, file: null });
    setFormErrors({});
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = "Título é obrigatório";
    if (!form.price || isNaN(parseFloat(form.price)) || parseFloat(form.price) <= 0)
      errors.price = "Preço deve ser maior que R$ 0,00";
    if (!form.file) errors.file = "Selecione um arquivo";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleUploadAndCreate() {
    if (!validateForm() || !form.file) return;

    setIsSubmitting(true);
    setUploadProgress("Solicitando URL de upload...");

    try {
      // 1. Get presigned URL
      const presignedRes = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: form.file.name,
          contentType: form.file.type,
          botId,
        }),
      });

      const presignedData = await presignedRes.json();
      if (!presignedData.success) {
        toast.error(presignedData.error ?? "Erro ao obter URL de upload");
        return;
      }

      const { url, key } = presignedData.data as { url: string; key: string };

      // 2. Upload file directly to S3/Wasabi
      setUploadProgress("Enviando arquivo...");
      const uploadRes = await fetch(url, {
        method: "PUT",
        body: form.file,
        headers: { "Content-Type": form.file.type },
      });

      if (!uploadRes.ok) {
        toast.error("Falha no upload do arquivo");
        return;
      }

      // 3. Create content record
      setUploadProgress("Salvando conteúdo...");
      const contentType = detectContentType(form.file.type);
      const result = await createContent({
        botId,
        title: form.title,
        description: form.description || undefined,
        type: contentType,
        price: parseFloat(form.price),
        originalKey: key,
        isPublished: form.isPublished,
      });

      if (!result.success) {
        toast.error(result.error ?? "Erro ao criar conteúdo");
        return;
      }

      toast.success("Conteúdo criado com sucesso!");
      setIsDialogOpen(false);
      resetForm();
      router.refresh();
    } catch {
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  }

  async function handleTogglePublish(contentId: string) {
    const result = await togglePublish(contentId);
    if (!result.success) {
      toast.error(result.error ?? "Erro ao alterar publicação");
      return;
    }
    toast.success(
      result.data?.isPublished ? "Conteúdo publicado!" : "Conteúdo despublicado."
    );
    router.refresh();
  }

  async function handleDelete(contentId: string) {
    setIsDeletingId(contentId);
    try {
      const result = await deleteContent(contentId);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao excluir conteúdo");
        return;
      }
      toast.success("Conteúdo excluído.");
      router.refresh();
    } catch {
      toast.error("Erro ao excluir conteúdo");
    } finally {
      setIsDeletingId(null);
      setDeleteId(null);
    }
  }

  function openEditDialog(item: ContentItem) {
    setEditItem(item);
    setEditForm({
      title: item.title,
      description: item.description ?? "",
      price: String(item.price),
      isPublished: item.isPublished ?? false,
    });
    setIsEditDialogOpen(true);
  }

  async function handleEdit() {
    if (!editItem) return;
    const errors: Record<string, string> = {};
    if (!editForm.title.trim()) errors.title = "Título é obrigatório";
    if (!editForm.price || isNaN(parseFloat(editForm.price)) || parseFloat(editForm.price) <= 0)
      errors.price = "Preço inválido";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsEditSubmitting(true);
    try {
      const result = await updateContent(editItem.id, {
        title: editForm.title,
        description: editForm.description || undefined,
        price: parseFloat(editForm.price),
        isPublished: editForm.isPublished,
      });
      if (!result.success) {
        toast.error(result.error ?? "Erro ao atualizar conteúdo");
        return;
      }
      toast.success("Conteúdo atualizado!");
      setIsEditDialogOpen(false);
      router.refresh();
    } catch {
      toast.error("Erro ao atualizar conteúdo");
    } finally {
      setIsEditSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() => {
            resetForm();
            setIsDialogOpen(true);
          }}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Conteúdo
        </Button>
      </div>

      {initialContent.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-600/10 mb-4">
            <ImageIcon className="h-8 w-8 text-violet-400" />
          </div>
          <p className="text-lg font-medium text-zinc-300">
            Nenhum conteúdo ainda
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Adicione imagens, vídeos ou arquivos para vender via Telegram
          </p>
          <Button
            onClick={() => { resetForm(); setIsDialogOpen(true); }}
            className="mt-6 bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar primeiro conteúdo
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {initialContent.map((item) => (
            <Card
              key={item.id}
              className="border-zinc-800 bg-zinc-900 text-zinc-100 flex flex-col"
            >
              {/* Thumbnail / Preview */}
              <div
                className={`flex h-40 items-center justify-center rounded-t-lg ${getContentTypeBg(item.type)}`}
              >
                {item.previewKey ? (
                  <img
                    src={`/api/content/${item.id}/preview`}
                    alt={item.title}
                    className="h-full w-full rounded-t-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  getContentIcon(item.type)
                )}
              </div>

              <CardContent className="flex-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-100 truncate">
                      {item.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        {getContentTypeLabel(item.type)}
                      </span>
                      <span className="text-xs text-zinc-600">•</span>
                      <span className="text-xs font-semibold text-violet-400">
                        {formatCurrency(item.price)}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={item.isPublished ? "default" : "secondary"}
                    className={
                      item.isPublished
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shrink-0 text-xs"
                        : "bg-zinc-700 text-zinc-400 shrink-0 text-xs"
                    }
                  >
                    {item.isPublished ? "Público" : "Rascunho"}
                  </Badge>
                </div>

                {item.description && (
                  <p className="mt-2 text-xs text-zinc-500 line-clamp-2">
                    {item.description}
                  </p>
                )}

                <p className="mt-2 text-xs text-zinc-600">
                  {item.purchaseCount ?? 0} vendas
                </p>
              </CardContent>

              <CardFooter className="border-t border-zinc-800 p-3 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTogglePublish(item.id)}
                  className="flex-1 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  {item.isPublished ? (
                    <>
                      <EyeOff className="mr-1 h-3.5 w-3.5" />
                      Despublicar
                    </>
                  ) : (
                    <>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      Publicar
                    </>
                  )}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="border-zinc-700 bg-zinc-800 text-zinc-100"
                  >
                    <DropdownMenuItem
                      onClick={() => openEditDialog(item)}
                      className="hover:bg-zinc-700 cursor-pointer"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    <DropdownMenuItem
                      onClick={() => setDeleteId(item.id)}
                      className="text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Upload / Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsDialogOpen(open); if (!open) resetForm(); } }}>
        <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Conteúdo</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Faça upload de um arquivo e configure as informações de venda
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File Upload */}
            <div className="space-y-2">
              <Label className="text-zinc-300">
                Arquivo <span className="text-red-400">*</span>
              </Label>
              <div
                className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                  form.file
                    ? "border-violet-500/50 bg-violet-500/5"
                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,application/pdf,.zip,.rar"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setForm((prev) => ({ ...prev, file }));
                    if (file && !form.title) {
                      const name = file.name.replace(/\.[^/.]+$/, "");
                      setForm((prev) => ({ ...prev, file, title: name }));
                    }
                    if (formErrors.file) setFormErrors((prev) => ({ ...prev, file: "" }));
                  }}
                  disabled={isSubmitting}
                />
                {form.file ? (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20">
                      {getContentIcon(detectContentType(form.file.type))}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-zinc-200">{form.file.name}</p>
                      <p className="text-xs text-zinc-500">
                        {(form.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-zinc-500" />
                    <div className="text-center">
                      <p className="text-sm text-zinc-400">
                        Clique para selecionar arquivo
                      </p>
                      <p className="text-xs text-zinc-600">
                        Imagens, vídeos, PDF, ZIP (máx. depende da config S3)
                      </p>
                    </div>
                  </>
                )}
              </div>
              {formErrors.file && (
                <p className="text-xs text-red-400">{formErrors.file}</p>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="ct-title" className="text-zinc-300">
                Título <span className="text-red-400">*</span>
              </Label>
              <Input
                id="ct-title"
                value={form.title}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, title: e.target.value }));
                  if (formErrors.title) setFormErrors((prev) => ({ ...prev, title: "" }));
                }}
                placeholder="Ex: Foto exclusiva premium"
                disabled={isSubmitting}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500"
              />
              {formErrors.title && (
                <p className="text-xs text-red-400">{formErrors.title}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="ct-desc" className="text-zinc-300">
                Descrição
              </Label>
              <Textarea
                id="ct-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Descreva o conteúdo..."
                rows={2}
                disabled={isSubmitting}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500 resize-none"
              />
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="ct-price" className="text-zinc-300">
                Preço (R$) <span className="text-red-400">*</span>
              </Label>
              <Input
                id="ct-price"
                type="number"
                step="0.01"
                min="0.01"
                value={form.price}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, price: e.target.value }));
                  if (formErrors.price) setFormErrors((prev) => ({ ...prev, price: "" }));
                }}
                placeholder="9.90"
                disabled={isSubmitting}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500"
              />
              {formErrors.price && (
                <p className="text-xs text-red-400">{formErrors.price}</p>
              )}
            </div>

            {/* Publish toggle */}
            <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
              <div>
                <p className="text-sm text-zinc-300">Publicar imediatamente</p>
                <p className="text-xs text-zinc-500">
                  O conteúdo ficará visível no bot
                </p>
              </div>
              <Switch
                checked={form.isPublished}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, isPublished: checked }))
                }
                disabled={isSubmitting}
                className="data-[state=checked]:bg-violet-600"
              />
            </div>

            {/* Upload Progress */}
            {uploadProgress && (
              <div className="flex items-center gap-2 rounded-md bg-zinc-800 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                <p className="text-sm text-zinc-400">{uploadProgress}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => { setIsDialogOpen(false); resetForm(); }}
              disabled={isSubmitting}
              className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUploadAndCreate}
              disabled={isSubmitting}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Criar Conteúdo"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if (!isEditSubmitting) { setIsEditDialogOpen(open); setFormErrors({}); } }}>
        <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Conteúdo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-zinc-300">Título</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                disabled={isEditSubmitting}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 focus:border-violet-500"
              />
              {formErrors.title && <p className="text-xs text-red-400">{formErrors.title}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Descrição</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                disabled={isEditSubmitting}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 focus:border-violet-500 resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={editForm.price}
                onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))}
                disabled={isEditSubmitting}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 focus:border-violet-500"
              />
              {formErrors.price && <p className="text-xs text-red-400">{formErrors.price}</p>}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
              <div>
                <p className="text-sm text-zinc-300">Publicado</p>
              </div>
              <Switch
                checked={editForm.isPublished}
                onCheckedChange={(checked) =>
                  setEditForm((p) => ({ ...p, isPublished: checked }))
                }
                disabled={isEditSubmitting}
                className="data-[state=checked]:bg-violet-600"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isEditSubmitting}
              className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEdit}
              disabled={isEditSubmitting}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
            >
              {isEditSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
              ) : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Conteúdo</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Tem certeza que deseja excluir este conteúdo? Os arquivos no storage
              também serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeleteId(null)}
              className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={!!isDeletingId}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeletingId ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Excluindo...</>
              ) : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
