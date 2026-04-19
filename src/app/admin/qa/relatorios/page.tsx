"use client"

import { useState, useEffect } from "react"
import {
  getQaReports,
  createQaReport,
  finalizeQaReport,
  reopenQaReport,
  deleteQaReport,
} from "@/server/actions/qa.actions"
import {
  ExternalLink,
  Trash2,
  Check,
  RotateCcw,
  Plus,
  ClipboardCopy,
  Loader2,
} from "lucide-react"

interface QaReportItem {
  id: string
  marcado: boolean
  anotacoes: string | null
  task: { nome: string }
}

interface QaReport {
  id: string
  titulo: string
  publicToken: string
  status: "EM_ANDAMENTO" | "FINALIZADO"
  criadoPor: { name: string }
  createdAt: Date | string
  finalizadoEm: Date | string | null
  items: QaReportItem[]
}

export default function QaRelatoriosPage() {
  const [reports, setReports] = useState<QaReport[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<
    "TODOS" | "EM_ANDAMENTO" | "FINALIZADO"
  >("TODOS")

  useEffect(() => {
    loadReports()
  }, [])

  async function loadReports() {
    const result = await getQaReports()
    if (result.success && result.data) {
      setReports(result.data as QaReport[])
    }
    setLoading(false)
  }

  async function handleCreate() {
    if (!newTitle.trim()) {
      setError("Título é obrigatório")
      return
    }
    setCreating(true)
    setError("")

    const result = await createQaReport(newTitle.trim())
    if (result.success) {
      setShowNewForm(false)
      setNewTitle("")
      await loadReports()
    } else {
      setError(result.error || "Erro ao criar relatório")
    }
    setCreating(false)
  }

  async function handleFinalize(id: string) {
    if (!confirm("Finalizar este relatório? Ele não poderá mais ser editado externamente."))
      return
    await finalizeQaReport(id)
    await loadReports()
  }

  async function handleReopen(id: string) {
    await reopenQaReport(id)
    await loadReports()
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este relatório permanentemente?")) return
    await deleteQaReport(id)
    await loadReports()
  }

  function getShareUrl(token: string) {
    return `${window.location.origin}/qa/${token}`
  }

  async function copyLink(token: string, reportId: string) {
    await navigator.clipboard.writeText(getShareUrl(token))
    setCopiedId(reportId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function formatDate(date: Date | string) {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const filteredReports =
    filterStatus === "TODOS"
      ? reports
      : reports.filter((r) => r.status === filterStatus)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Relatórios de Teste</h1>
          <p className="text-slate-600 mt-1">
            Gere planos de teste com todas as tasks cadastradas e compartilhe externamente.
          </p>
        </div>
        <button
          onClick={() => {
            setShowNewForm(true)
            setError("")
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} /> Novo Relatório
        </button>
      </div>

      {showNewForm && (
        <div className="mb-6 border rounded-lg p-4 bg-slate-50">
          <h3 className="font-semibold text-slate-900 mb-3">Novo Relatório de Teste</h3>
          <p className="text-sm text-slate-600 mb-3">
            Será gerado um checklist com todas as tasks ativas cadastradas no sistema.
          </p>
          {error && (
            <div className="p-3 mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Título do Relatório *
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex: Teste de Release v2.5 - 08/04/2026"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              Gerar Relatório
            </button>
            <button
              onClick={() => {
                setShowNewForm(false)
                setNewTitle("")
              }}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <div className="flex gap-2 mb-4">
          {(["TODOS", "EM_ANDAMENTO", "FINALIZADO"] as const).map((status) => {
            const count =
              status === "TODOS"
                ? reports.length
                : reports.filter((r) => r.status === status).length
            const label =
              status === "TODOS"
                ? "Todos"
                : status === "EM_ANDAMENTO"
                  ? "Em Andamento"
                  : "Finalizados"
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  filterStatus === status
                    ? "bg-primary-600 text-white border-primary-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {filteredReports.length > 0 ? (
        <div className="space-y-3">
          {filteredReports.map((report) => {
            const totalItems = report.items.length
            const checkedItems = report.items.filter((i) => i.marcado).length
            const progressPct =
              totalItems > 0 ? (checkedItems / totalItems) * 100 : 0

            return (
              <div key={report.id} className="border rounded-lg bg-white overflow-hidden">
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 truncate">
                          {report.titulo}
                        </h3>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            report.status === "EM_ANDAMENTO"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {report.status === "EM_ANDAMENTO"
                            ? "Em Andamento"
                            : "Finalizado"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                        <span>Por {report.criadoPor.name}</span>
                        <span>-</span>
                        <span>{formatDate(report.createdAt)}</span>
                        {report.finalizadoEm && (
                          <>
                            <span>-</span>
                            <span>
                              Finalizado em{" "}
                              {new Date(report.finalizadoEm).toLocaleDateString("pt-BR")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => copyLink(report.publicToken, report.id)}
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Copiar link"
                      >
                        <ClipboardCopy size={16} />
                      </button>
                      <a
                        href={getShareUrl(report.publicToken)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Abrir link externo"
                      >
                        <ExternalLink size={16} />
                      </a>
                      {report.status === "EM_ANDAMENTO" ? (
                        <button
                          onClick={() => handleFinalize(report.id)}
                          className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Finalizar"
                        >
                          <Check size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReopen(report.id)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Reabrir"
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(report.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>
                        {checkedItems}/{totalItems} tasks concluídas
                      </span>
                      <span>{Math.round(progressPct)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          progressPct === 100 ? "bg-green-500" : "bg-primary-600"
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {copiedId === report.id && (
                    <div className="mt-2 text-xs text-green-600 font-medium">
                      Link copiado!
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          {reports.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-1">Nenhum relatório criado</p>
              <p className="text-sm">Crie seu primeiro relatório de teste para começar.</p>
            </>
          ) : (
            <p>Nenhum relatório encontrado com este filtro.</p>
          )}
        </div>
      )}
    </div>
  )
}
