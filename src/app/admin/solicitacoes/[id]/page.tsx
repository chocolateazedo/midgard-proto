"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  getSolicitationById,
  updateSolicitationStatus,
  addComment,
  getAttachmentUploadUrl,
} from "@/server/actions/solicitation.actions"
import type { SolicitationStatus } from "@prisma/client"
import {
  ArrowLeft,
  Loader2,
  Send,
  Paperclip,
  X,
  Image as ImageIcon,
  Film,
  FileText,
} from "lucide-react"

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  SOLICITADO: {
    label: "Solicitado",
    color: "bg-yellow-100 text-yellow-800",
    bgColor: "border-yellow-300",
  },
  EM_ANDAMENTO: {
    label: "Em Andamento",
    color: "bg-blue-100 text-blue-800",
    bgColor: "border-blue-300",
  },
  NEGADA: {
    label: "Negada",
    color: "bg-red-100 text-red-800",
    bgColor: "border-red-300",
  },
  FINALIZADA: {
    label: "Finalizada",
    color: "bg-green-100 text-green-800",
    bgColor: "border-green-300",
  },
}

interface Attachment {
  id: string
  fileKey: string
  fileUrl: string | null
  fileName: string
  fileType: string
}

interface Comment {
  id: string
  texto: string
  autor: { name: string }
  createdAt: string
  attachments: Attachment[]
}

interface SolicitationDetail {
  id: string
  titulo: string
  descricao: string
  status: SolicitationStatus
  prioridade: number
  criadoPor: { name: string }
  createdAt: string
  comments: Comment[]
}

interface PendingFile {
  file: File
  preview?: string
}

export default function SolicitacaoDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [solicitation, setSolicitation] = useState<SolicitationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState("")
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [sending, setSending] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadData()
  }, [params.id])

  async function loadData() {
    const result = await getSolicitationById(params.id)
    if (result.success && result.data) {
      setSolicitation(result.data)
    } else {
      router.push("/admin/solicitacoes")
    }
    setLoading(false)
  }

  async function handleStatusChange(newStatus: SolicitationStatus) {
    if (!solicitation) return
    setChangingStatus(true)
    const result = await updateSolicitationStatus(solicitation.id, newStatus)
    if (result.success) {
      setSolicitation({ ...solicitation, status: newStatus })
    }
    setChangingStatus(false)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return

    const newPending: PendingFile[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const pf: PendingFile = { file }
      if (file.type.startsWith("image/")) {
        pf.preview = URL.createObjectURL(file)
      }
      newPending.push(pf)
    }
    setPendingFiles((prev) => [...prev, ...newPending])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => {
      const updated = [...prev]
      if (updated[index].preview) URL.revokeObjectURL(updated[index].preview!)
      updated.splice(index, 1)
      return updated
    })
  }

  async function handleSendComment() {
    if (!solicitation || (!commentText.trim() && pendingFiles.length === 0)) return
    setSending(true)

    try {
      // Upload de arquivos primeiro
      const uploadedAttachments: {
        fileKey: string
        fileName: string
        fileType: string
      }[] = []

      for (const pf of pendingFiles) {
        const urlResult = await getAttachmentUploadUrl({
          filename: pf.file.name,
          contentType: pf.file.type,
        })
        if (!urlResult.success || !urlResult.data) continue

        await fetch(urlResult.data.url, {
          method: "PUT",
          body: pf.file,
          headers: { "Content-Type": pf.file.type },
        })

        uploadedAttachments.push({
          fileKey: urlResult.data.key,
          fileName: pf.file.name,
          fileType: pf.file.type,
        })
      }

      const result = await addComment({
        solicitationId: solicitation.id,
        texto: commentText.trim() || "(anexo)",
        attachments:
          uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      })

      if (result.success) {
        setCommentText("")
        setPendingFiles([])
        await loadData()
        setTimeout(() => {
          commentsEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }, 100)
      }
    } catch {
      // Erro silencioso
    }

    setSending(false)
  }

  function getFileIcon(fileType: string) {
    if (fileType.startsWith("image/")) return <ImageIcon size={14} />
    if (fileType.startsWith("video/")) return <Film size={14} />
    return <FileText size={14} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!solicitation) return null

  const statusConf = STATUS_CONFIG[solicitation.status]
  const availableTransitions: { status: SolicitationStatus; label: string }[] = []

  if (solicitation.status === "SOLICITADO") {
    availableTransitions.push(
      { status: "EM_ANDAMENTO", label: "Iniciar" },
      { status: "NEGADA", label: "Negar" }
    )
  } else if (solicitation.status === "EM_ANDAMENTO") {
    availableTransitions.push(
      { status: "FINALIZADA", label: "Finalizar" },
      { status: "NEGADA", label: "Negar" }
    )
  } else if (solicitation.status === "NEGADA") {
    availableTransitions.push({ status: "SOLICITADO", label: "Reabrir" })
  } else if (solicitation.status === "FINALIZADA") {
    availableTransitions.push({ status: "EM_ANDAMENTO", label: "Reabrir" })
  }

  return (
    <div>
      <Link
        href="/admin/solicitacoes"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={14} /> Voltar para solicitações
      </Link>

      {/* Cabeçalho */}
      <div className="bg-white border rounded-lg p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">
                {solicitation.titulo}
              </h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConf.color}`}
              >
                {statusConf.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
              <span>Por {solicitation.criadoPor.name}</span>
              <span>-</span>
              <span>
                {new Date(solicitation.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          {/* Ações de mudança de status */}
          {availableTransitions.length > 0 && (
            <div className="flex gap-2 flex-shrink-0">
              {availableTransitions.map((t) => (
                <button
                  key={t.status}
                  onClick={() => handleStatusChange(t.status)}
                  disabled={changingStatus}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                    t.status === "NEGADA"
                      ? "border-red-300 text-red-700 hover:bg-red-50"
                      : t.status === "FINALIZADA"
                        ? "border-green-300 text-green-700 hover:bg-green-50"
                        : "border-primary-300 text-primary-700 hover:bg-primary-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-slate-700 whitespace-pre-wrap">{solicitation.descricao}</p>
        </div>
      </div>

      {/* Thread de comentários */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">
            Comentários ({solicitation.comments.length})
          </h2>
        </div>

        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {solicitation.comments.length > 0 ? (
            solicitation.comments.map((comment) => (
              <div key={comment.id} className="px-6 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                    {comment.autor.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-900">
                    {comment.autor.name}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(comment.createdAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap ml-9">
                  {comment.texto}
                </p>

                {/* Anexos */}
                {comment.attachments.length > 0 && (
                  <div className="mt-3 ml-9 space-y-2">
                    {comment.attachments.map((att) => (
                      <div key={att.id}>
                        {att.fileType.startsWith("image/") && att.fileUrl ? (
                          <a
                            href={att.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img
                              src={att.fileUrl}
                              alt={att.fileName}
                              className="max-w-sm max-h-64 rounded-lg border border-slate-200 object-cover"
                            />
                          </a>
                        ) : att.fileType.startsWith("video/") && att.fileUrl ? (
                          <video
                            src={att.fileUrl}
                            controls
                            className="max-w-sm rounded-lg border border-slate-200"
                          />
                        ) : (
                          <a
                            href={att.fileUrl || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            {getFileIcon(att.fileType)}
                            {att.fileName}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-sm text-slate-400">
              Nenhum comentário ainda. Seja o primeiro a comentar.
            </div>
          )}
          <div ref={commentsEndRef} />
        </div>

        {/* Form de novo comentário */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">
          {/* Previews de arquivos pendentes */}
          {pendingFiles.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {pendingFiles.map((pf, idx) => (
                <div
                  key={idx}
                  className="relative group bg-white border border-slate-200 rounded-lg overflow-hidden"
                >
                  {pf.preview ? (
                    <img
                      src={pf.preview}
                      alt={pf.file.name}
                      className="w-20 h-20 object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 flex flex-col items-center justify-center text-slate-400">
                      {getFileIcon(pf.file.type)}
                      <span className="text-[10px] mt-1 px-1 truncate max-w-full">
                        {pf.file.name}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => removeFile(idx)}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Escreva um comentário..."
              rows={2}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSendComment()
                }
              }}
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                title="Anexar arquivo"
              >
                <Paperclip size={18} />
              </button>
              <button
                onClick={handleSendComment}
                disabled={
                  sending || (!commentText.trim() && pendingFiles.length === 0)
                }
                className="p-2 text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
                title="Enviar (Ctrl+Enter)"
              >
                {sending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileSelect}
          />
          <p className="text-xs text-slate-400 mt-2">
            Ctrl+Enter para enviar. Suporte a imagens, vídeos e documentos.
          </p>
        </div>
      </div>
    </div>
  )
}
