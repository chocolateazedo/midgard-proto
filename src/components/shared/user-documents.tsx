"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { updateAvatar, updateDocuments } from "@/server/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle,
  FileImage,
  User,
} from "lucide-react";

interface FileUploadBoxProps {
  label: string;
  currentKey: string | null;
  onUpload: (key: string) => void;
  uploadType: "avatar" | "doc-front" | "doc-back" | "doc-selfie";
  userId?: string;
  accept?: string;
  disabled?: boolean;
  // URL pra exibir o arquivo atual (ex: /api/user-doc/[userId]/avatar).
  // Quando passada + há currentKey, renderiza thumb clicável (abre original).
  viewUrl?: string | null;
}

function FileUploadBox({
  label,
  currentKey,
  onUpload,
  uploadType,
  userId,
  accept = "image/*",
  disabled,
  viewUrl,
}: FileUploadBoxProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      // Gerar presigned URL
      const res = await fetch("/api/upload/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          type: uploadType,
          userId,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "Erro ao gerar URL de upload");
        return;
      }

      // Upload direto para S3
      const uploadRes = await fetch(data.data.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        toast.error("Falha no upload do arquivo");
        return;
      }

      setPreviewUrl(URL.createObjectURL(file));
      onUpload(data.data.key);
    } catch {
      toast.error("Erro ao fazer upload");
    } finally {
      setUploading(false);
    }
  }

  const hasFile = currentKey || previewUrl;
  // Mostra thumb sempre que tiver viewUrl (servidor) ou previewUrl (upload local).
  const thumbSrc = previewUrl ?? (currentKey && viewUrl ? viewUrl : null);

  return (
    <div className="space-y-2">
      <Label className="text-slate-700 text-sm">{label}</Label>
      <div
        className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 transition-colors ${
          hasFile
            ? "border-emerald-300 bg-emerald-50/50"
            : "border-slate-200 bg-slate-50/50 hover:border-slate-300 cursor-pointer"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        onClick={() => {
          if (!thumbSrc) inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={disabled || uploading}
        />

        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        ) : thumbSrc ? (
          <div className="flex w-full flex-col items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewerOpen(true);
              }}
              className="relative w-full h-32 rounded overflow-hidden bg-slate-100 hover:opacity-90 transition"
              aria-label="Ver em tamanho original"
            >
              <img src={thumbSrc} alt={label} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <p className="text-white text-xs font-medium">Clique para ampliar</p>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              disabled={disabled || uploading}
              className="text-xs text-primary-600 hover:text-primary-700 underline"
            >
              Trocar arquivo
            </button>
          </div>
        ) : hasFile ? (
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            <span className="text-sm text-emerald-600">Arquivo enviado</span>
          </div>
        ) : (
          <>
            <Upload className="h-5 w-5 text-slate-400" />
            <p className="text-xs text-slate-500">Clique para enviar</p>
          </>
        )}
      </div>

      {thumbSrc && (
        <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
          <DialogContent className="max-w-3xl p-0 overflow-hidden bg-white border-slate-200/60">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle className="text-slate-900">{label}</DialogTitle>
            </DialogHeader>
            <div className="p-4 pt-2">
              <img
                src={thumbSrc}
                alt={label}
                className="w-full max-h-[80vh] rounded-lg object-contain bg-slate-50"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// --- Avatar Upload ---

interface AvatarUploadProps {
  currentAvatarKey: string | null;
  userId?: string;
}

export function AvatarUpload({ currentAvatarKey, userId }: AvatarUploadProps) {
  const [saving, setSaving] = useState(false);
  const [avatarKey, setAvatarKey] = useState<string | null>(null);

  async function handleSave(key: string) {
    setSaving(true);
    try {
      const result = await updateAvatar(key, userId);
      if (result.success) {
        toast.success("Avatar atualizado");
      } else {
        toast.error(result.error ?? "Erro ao salvar avatar");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4 text-primary-600" />
          Foto de Perfil
        </CardTitle>
        <CardDescription className="text-slate-400">
          Foto do usuário na plataforma
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-xs">
          <FileUploadBox
            label="Avatar"
            currentKey={avatarKey ?? currentAvatarKey}
            onUpload={(key) => {
              setAvatarKey(key);
              handleSave(key);
            }}
            uploadType="avatar"
            userId={userId}
            accept="image/*"
            disabled={saving}
            viewUrl={userId ? `/api/user-doc/${userId}/avatar` : null}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// --- Document Upload ---

interface DocumentUploadProps {
  currentDocType: string | null;
  currentDocFrontKey: string | null;
  currentDocBackKey: string | null;
  currentDocSelfieKey: string | null;
  userId?: string;
}

export function DocumentUpload({
  currentDocType,
  currentDocFrontKey,
  currentDocBackKey,
  currentDocSelfieKey,
  userId,
}: DocumentUploadProps) {
  const [docType, setDocType] = useState(currentDocType ?? "");
  const [frontKey, setFrontKey] = useState<string | null>(null);
  const [backKey, setBackKey] = useState<string | null>(null);
  const [selfieKey, setSelfieKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const actualFront = frontKey ?? currentDocFrontKey;
  const actualBack = backKey ?? currentDocBackKey;
  const actualSelfie = selfieKey ?? currentDocSelfieKey;
  const canSave = docType && actualFront && actualBack && actualSelfie;

  async function handleSave() {
    if (!canSave) {
      toast.error("Preencha todos os campos e envie todas as fotos");
      return;
    }

    setSaving(true);
    try {
      const result = await updateDocuments({
        docType,
        docFrontKey: actualFront!,
        docBackKey: actualBack!,
        docSelfieKey: actualSelfie!,
        targetUserId: userId,
      });
      if (result.success) {
        toast.success("Documentos salvos com sucesso");
      } else {
        toast.error(result.error ?? "Erro ao salvar documentos");
      }
    } finally {
      setSaving(false);
    }
  }

  const docTypeLabels: Record<string, string> = {
    rg: "RG",
    rne: "RNE",
    cpf: "CPF",
  };

  return (
    <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileImage className="h-4 w-4 text-primary-600" />
          Documentos
        </CardTitle>
        <CardDescription className="text-slate-400">
          Documento de identificação com foto (frente, verso e selfie com documento)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-xs">
          <Label className="text-slate-700 text-sm">Tipo de Documento</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="bg-white border-slate-200 text-slate-900">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="rg" className="text-slate-900">RG</SelectItem>
              <SelectItem value="rne" className="text-slate-900">RNE</SelectItem>
              <SelectItem value="cpf" className="text-slate-900">CPF</SelectItem>
            </SelectContent>
          </Select>
          {currentDocType && (
            <p className="text-xs text-slate-400">
              Documento atual: {docTypeLabels[currentDocType] ?? currentDocType}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FileUploadBox
            label="Frente do documento"
            currentKey={actualFront}
            onUpload={setFrontKey}
            uploadType="doc-front"
            userId={userId}
            disabled={saving}
            viewUrl={userId ? `/api/user-doc/${userId}/frente` : null}
          />
          <FileUploadBox
            label="Verso do documento"
            currentKey={actualBack}
            onUpload={setBackKey}
            uploadType="doc-back"
            userId={userId}
            disabled={saving}
            viewUrl={userId ? `/api/user-doc/${userId}/verso` : null}
          />
          <FileUploadBox
            label="Selfie com documento"
            currentKey={actualSelfie}
            onUpload={setSelfieKey}
            uploadType="doc-selfie"
            userId={userId}
            disabled={saving}
            viewUrl={userId ? `/api/user-doc/${userId}/selfie` : null}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="bg-primary-600 hover:bg-primary-700 text-white"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar Documentos"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
