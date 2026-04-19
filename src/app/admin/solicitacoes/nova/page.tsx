"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createSolicitation } from "@/server/actions/solicitation.actions"
import { Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NovaSolicitacaoPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    prioridade: 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.titulo.trim()) {
      setError("Título é obrigatório")
      return
    }
    if (!formData.descricao.trim()) {
      setError("Descrição é obrigatória")
      return
    }

    setSaving(true)
    setError("")

    const result = await createSolicitation(formData)
    if (result.success && result.data) {
      router.push(`/admin/solicitacoes/${result.data.id}`)
    } else {
      setError(result.error || "Erro ao criar solicitação")
      setSaving(false)
    }
  }

  return (
    <div>
      <Link
        href="/admin/solicitacoes"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={14} /> Voltar para solicitações
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-6">Nova Solicitação</h1>

      <form onSubmit={handleSubmit} className="max-w-2xl">
        {error && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Título *
            </label>
            <input
              type="text"
              value={formData.titulo}
              onChange={(e) =>
                setFormData({ ...formData, titulo: e.target.value })
              }
              placeholder="Ex: Implementar notificações push"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descrição *
            </label>
            <textarea
              value={formData.descricao}
              onChange={(e) =>
                setFormData({ ...formData, descricao: e.target.value })
              }
              placeholder="Descreva em detalhes a solicitação..."
              rows={6}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Prioridade
            </label>
            <select
              value={formData.prioridade}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  prioridade: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            >
              <option value={0}>Normal</option>
              <option value={1}>Alta</option>
              <option value={2}>Urgente</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Criar Solicitação
          </button>
          <Link
            href="/admin/solicitacoes"
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
