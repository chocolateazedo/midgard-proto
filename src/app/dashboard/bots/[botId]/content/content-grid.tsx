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
      return <ImageIcon className="h-8 w-8 text-primary-600" />;
    case "video":
      return <Video className="h-8 w-8 text-blue-400" />;
    case "bundle":
      return <Package className="h-8 w-8 text-amber-600" />;
    default:
      return <File className="h-8 w-8 text-slate-500" />;
  }
}

function getContentTypeBg(type: string) {
  switch (type) {
    case "image":
      return "bg-primary-50";
    case "video":
      return "bg-blue-50";
    case "bundle":
      return "bg-amber-50";
    default:
      return "bg-slate-50";
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

function ContentThumbnail({ item }: { item: ContentItem }) {
  const [failed, setFailed] = useState(false);

  if (!item.previewKey || failed) {
    return getContentIcon(item.type);
  }

  return (
    <img
      src={`/api/content/${item.id}/preview`}
      alt={item.title}
      className="h-full w-full rounded-t-lg object-cover"
      onError={() => setFailed(true)}
    />
  );
}

interface UploadFormData {
  title: string;
  description: string;
  price: string;
  isFree: boolean;
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
    isFree: false,
    isPublished: false,
    file: null,
  });

  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<ContentItem | null>(null);

  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    price: "",
    isFree: false,
    isPublished: false,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  function resetForm() {
    setForm({ title: "", description: "", price: "", isFree: false, isPublished: false, file: null });
    setFormErrors({});
    setUploadProgress(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = "Título é obrigatório";
    if (!form.isFree) {
      if (!form.price || isNaN(parseFloat(form.price)) || parseFloat(form.price) <= 0)
        errors.price = "Preço deve ser maior que R$ 0,00";
    }
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
        price: form.isFree ? 0 : parseFloat(form.price),
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
      isFree: item.price === 0,
      isPublished: item.isPublished ?? false,
    });
    setIsEditDialogOpen(true);
  }

  async function handleEdit() {
    if (!editItem) return;
    const errors: Record<string, string> = {};
    if (!editForm.title.trim()) errors.title = "Título é obrigatório";
    if (!editForm.isFree) {
      if (!editForm.price || isNaN(parseFloat(editForm.price)) || parseFloat(editForm.price) <= 0)
        errors.price = "Preço inválido";
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsEditSubmitting(true);
    try {
      const result = await updateContent(editItem.id, {
        title: editForm.title,
        description: editForm.description || undefined,
        price: editForm.isFree ? 0 : parseFloat(editForm.price),
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
          className="bg-primary-600 hover:bg-primary-700 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Conteúdo
        </Button>
      </div>

      {initialContent.length === 0 ? (
        <div className="rounded-xl border border-slate-200/60 bg-white py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-600/10 mb-4">
            <ImageIcon className="h-8 w-8 text-primary-600" />
          </div>
          <p className="text-lg font-medium text-slate-700">
            Nenhum conteúdo ainda
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Adicione imagens, vídeos ou arquivos para vender via Telegram
          </p>
          <Button
            onClick={() => { resetForm(); setIsDialogOpen(true); }}
            className="mt-6 bg-primary-600 hover:bg-primary-700 text-white"
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
              className="bg-white border-slate-200/60 rounded-xl text-slate-900 flex flex-col"
            >
              {/* Thumbnail / Preview */}
              <div
                className={`flex h-40 items-center justify-center rounded-t-lg cursor-pointer ${getContentTypeBg(item.type)}`}
                onClick={() => (item.type === "image" || item.type === "video") && setViewingItem(item)}
              >
                <ContentThumbnail item={item} />
              </div>

              <CardContent className="flex-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {item.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {getContentTypeLabel(item.type)}
                      </span>
                      <span className="text-xs text-slate-300">•</span>
                      <span className={`text-xs font-semibold ${item.price === 0 ? "text-emerald-600" : "text-primary-600"}`}>
                        {item.price === 0 ? "Gratuito" : formatCurrency(item.price)}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={item.isPublished ? "default" : "secondary"}
                    className={
                      item.isPublished
                        ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30 shrink-0 text-xs"
                        : "bg-slate-100 text-slate-500 shrink-0 text-xs"
                    }
                  >
                    {item.isPublished ? "Público" : "Rascunho"}
                  </Badge>
                </div>

                {item.description && (
                  <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                    {item.description}
                  </p>
                )}

                <p className="mt-2 text-xs text-slate-300">
                  {item.purchaseCount ?? 0} vendas
                </p>
              </CardContent>

              <CardFooter className="border-t border-slate-200/60 p-3 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTogglePublish(item.id)}
                  className="flex-1 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50"
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
                      className="px-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="border-slate-200 bg-white text-slate-900"
                  >
                    <DropdownMenuItem
                      onClick={() => openEditDialog(item)}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-slate-200" />
                    <DropdownMenuItem
                      onClick={() => setDeleteId(item.id)}
                      className="text-red-600 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
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
        <DialogContent className="border-slate-200/60 bg-white text-slate-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Conteúdo</DialogTitle>
            <DialogDescription className="text-slate-400">
              Faça upload de um arquivo e configure as informações de venda
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File Upload */}
            <div className="space-y-2">
              <Label className="text-slate-700">
                Arquivo <span className="text-red-600">*</span>
              </Label>
              <div
                className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                  form.file
                    ? "border-primary-400 bg-primary-50/50"
                    : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
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
                    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
                    if (file && (file.type.startsWith("image/") || file.type.startsWith("video/"))) {
                      setFilePreviewUrl(URL.createObjectURL(file));
                    } else {
                      setFilePreviewUrl(null);
                    }
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
                    {filePreviewUrl ? (
                      <div className="relative w-full h-40 rounded-lg overflow-hidden">
                        {form.file.type.startsWith("video/") ? (
                          <video
                            src={filePreviewUrl}
                            className="h-full w-full object-cover"
                            muted
                          />
                        ) : (
                          <img
                            src={filePreviewUrl}
                            alt="Preview"
                            className="h-full w-full object-cover"
                          />
                        )}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <p className="text-white text-sm font-medium">Clique para trocar</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                        {getContentIcon(detectContentType(form.file.type))}
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-sm font-medium text-slate-800">{form.file.name}</p>
                      <p className="text-xs text-slate-400">
                        {(form.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-slate-400" />
                    <div className="text-center">
                      <p className="text-sm text-slate-500">
                        Clique para selecionar arquivo
                      </p>
                      <p className="text-xs text-slate-300">
                        Imagens, vídeos, PDF, ZIP (máx. depende da config S3)
                      </p>
                    </div>
                  </>
                )}
              </div>
              {formErrors.file && (
                <p className="text-xs text-red-600">{formErrors.file}</p>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="ct-title" className="text-slate-700">
                Título <span className="text-red-600">*</span>
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
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400"
              />
              {formErrors.title && (
                <p className="text-xs text-red-600">{formErrors.title}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="ct-desc" className="text-slate-700">
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
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400 resize-none"
              />
            </div>

            {/* Free toggle */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <p className="text-sm text-slate-700">Conteúdo gratuito</p>
                <p className="text-xs text-slate-400">
                  Disponível sem pagamento
                </p>
              </div>
              <Switch
                checked={form.isFree}
                onCheckedChange={(checked) => {
                  setForm((prev) => ({ ...prev, isFree: checked }));
                  if (checked && formErrors.price) setFormErrors((prev) => ({ ...prev, price: "" }));
                }}
                disabled={isSubmitting}
                className="data-[state=checked]:bg-primary-600"
              />
            </div>

            {/* Price */}
            {!form.isFree && (
              <div className="space-y-2">
                <Label htmlFor="ct-price" className="text-slate-700">
                  Preço (R$) <span className="text-red-600">*</span>
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
                  className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400"
                />
                {formErrors.price && (
                  <p className="text-xs text-red-600">{formErrors.price}</p>
                )}
              </div>
            )}

            {/* Publish toggle */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <p className="text-sm text-slate-700">Publicar imediatamente</p>
                <p className="text-xs text-slate-400">
                  O conteúdo ficará visível no bot
                </p>
              </div>
              <Switch
                checked={form.isPublished}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, isPublished: checked }))
                }
                disabled={isSubmitting}
                className="data-[state=checked]:bg-primary-600"
              />
            </div>

            {/* Upload Progress */}
            {uploadProgress && (
              <div className="flex items-center gap-2 rounded-md bg-slate-100 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                <p className="text-sm text-slate-500">{uploadProgress}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => { setIsDialogOpen(false); resetForm(); }}
              disabled={isSubmitting}
              className="border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUploadAndCreate}
              disabled={isSubmitting}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
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
        <DialogContent className="border-slate-200/60 bg-white text-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Conteúdo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-slate-700">Título</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                disabled={isEditSubmitting}
                className="border-slate-200 bg-white text-slate-900 focus:border-primary-400"
              />
              {formErrors.title && <p className="text-xs text-red-600">{formErrors.title}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Descrição</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                disabled={isEditSubmitting}
                className="border-slate-200 bg-white text-slate-900 focus:border-primary-400 resize-none"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <p className="text-sm text-slate-700">Conteúdo gratuito</p>
                <p className="text-xs text-slate-400">Disponível sem pagamento</p>
              </div>
              <Switch
                checked={editForm.isFree}
                onCheckedChange={(checked) => {
                  setEditForm((p) => ({ ...p, isFree: checked }));
                  if (checked && formErrors.price) setFormErrors((prev) => ({ ...prev, price: "" }));
                }}
                disabled={isEditSubmitting}
                className="data-[state=checked]:bg-primary-600"
              />
            </div>
            {!editForm.isFree && (
              <div className="space-y-2">
                <Label className="text-slate-700">Preço (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editForm.price}
                  onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))}
                  disabled={isEditSubmitting}
                  className="border-slate-200 bg-white text-slate-900 focus:border-primary-400"
                />
                {formErrors.price && <p className="text-xs text-red-600">{formErrors.price}</p>}
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <p className="text-sm text-slate-700">Publicado</p>
              </div>
              <Switch
                checked={editForm.isPublished}
                onCheckedChange={(checked) =>
                  setEditForm((p) => ({ ...p, isPublished: checked }))
                }
                disabled={isEditSubmitting}
                className="data-[state=checked]:bg-primary-600"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isEditSubmitting}
              className="border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEdit}
              disabled={isEditSubmitting}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
            >
              {isEditSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
              ) : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Content Dialog */}
      <Dialog open={!!viewingItem} onOpenChange={(open) => { if (!open) setViewingItem(null); }}>
        <DialogContent className="border-slate-200/60 bg-white text-slate-900 sm:max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>{viewingItem?.title}</DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-2">
            {viewingItem?.type === "video" ? (
              <video
                src={`/api/content/${viewingItem.id}/original`}
                controls
                className="w-full max-h-[70vh] rounded-lg bg-black"
              />
            ) : viewingItem?.type === "image" ? (
              <img
                src={`/api/content/${viewingItem.id}/original`}
                alt={viewingItem.title}
                className="w-full max-h-[70vh] rounded-lg object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent className="border-slate-200/60 bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Conteúdo</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              Tem certeza que deseja excluir este conteúdo? Os arquivos no storage
              também serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeleteId(null)}
              className="border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900"
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
