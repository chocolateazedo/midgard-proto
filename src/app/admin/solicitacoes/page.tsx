"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  getSolicitations,
  deleteSolicitation,
} from "@/server/actions/solicitation.actions"
import {
  Plus,
  Loader2,
  Trash2,
  MessageSquare,
  ArrowRight,
} from "lucide-react"

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  SOLICITADO: { label: "Solicitado", color: "bg-yellow-100 text-yellow-800" },
  EM_ANDAMENTO: { label: "Em Andamento", color: "bg-blue-100 text-blue-800" },
  NEGADA: { label: "Negada", color: "bg-red-100 text-red-800" },
  FINALIZADA: { label: "Finalizada", color: "bg-green-100 text-green-800" },
}

const PRIORIDADE_CONFIG: Record<number, { label: string; color: string }> = {
  0: { label: "Normal", color: "text-slate-500" },
  1: { label: "Alta", color: "text-orange-600" },
  2: { label: "Urgente", color: "text-red-600 font-semibold" },
}

interface SolicitationListItem {
  id: string
  titulo: string
  descricao: string
  status: string
  prioridade: number
  criadoPor: { name: string }
  createdAt: string
  _count: { comments: number }
}

export default function SolicitacoesPage() {
  const [solicitations, setSolicitations] = useState<SolicitationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("TODOS")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const result = await getSolicitations()
    if (result.success && result.data) {
      setSolicitations(result.data)
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta solicitação permanentemente?")) return
    await deleteSolicitation(id)
    await loadData()
  }

  const statuses = ["TODOS", "SOLICITADO", "EM_ANDAMENTO", "NEGADA", "FINALIZADA"]

  const filtered =
    filterStatus === "TODOS"
      ? solicitations
      : solicitations.filter((s) => s.status === filterStatus)

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
          <h1 className="text-2xl font-bold text-slate-900">Solicitações</h1>
          <p className="text-slate-600 mt-1">
            Gerencie solicitações de engenharia e acompanhe o progresso.
          </p>
        </div>
        <Link
          href="/admin/solicitacoes/nova"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} /> Nova Solicitação
        </Link>
      </div>

      {/* Filtros */}
      {solicitations.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {statuses.map((status) => {
            const count =
              status === "TODOS"
                ? solicitations.length
                : solicitations.filter((s) => s.status === status).length
            const label =
              status === "TODOS"
                ? "Todos"
                : STATUS_CONFIG[status]?.label || status
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

      {/* Lista */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((sol) => {
            const statusConf = STATUS_CONFIG[sol.status] || {
              label: sol.status,
              color: "bg-slate-100 text-slate-800",
            }
            const prioConf = PRIORIDADE_CONFIG[sol.prioridade] || PRIORIDADE_CONFIG[0]

            return (
              <div
                key={sol.id}
                className="border rounded-lg bg-white overflow-hidden hover:border-slate-300 transition-colors"
              >
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/admin/solicitacoes/${sol.id}`}
                          className="font-semibold text-slate-900 hover:text-primary-700 truncate"
                        >
                          {sol.titulo}
                        </Link>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConf.color}`}
                        >
                          {statusConf.label}
                        </span>
                        {sol.prioridade > 0 && (
                          <span className={`text-xs ${prioConf.color}`}>
                            {prioConf.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                        {sol.descricao}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span>Por {sol.criadoPor.name}</span>
                        <span>-</span>
                        <span>
                          {new Date(sol.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                        {sol._count.comments > 0 && (
                          <>
                            <span>-</span>
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare size={12} />
                              {sol._count.comments} comentário
                              {sol._count.comments !== 1 ? "s" : ""}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link
                        href={`/admin/solicitacoes/${sol.id}`}
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Ver detalhes"
                      >
                        <ArrowRight size={16} />
                      </Link>
                      <button
                        onClick={() => handleDelete(sol.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          {solicitations.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-1">Nenhuma solicitação criada</p>
              <p className="text-sm">Crie sua primeira solicitação para começar.</p>
            </>
          ) : (
            <p>Nenhuma solicitação encontrada com este filtro.</p>
          )}
        </div>
      )}
    </div>
  )
}
