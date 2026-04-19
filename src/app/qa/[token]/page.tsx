"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Loader2 } from "lucide-react"

interface ChecklistItem {
  id: string
  taskNome: string
  taskDescricao: string | null
  marcado: boolean
  anotacoes: string | null
}

interface ChecklistData {
  id: string
  titulo: string
  status: "EM_ANDAMENTO" | "FINALIZADO"
  criadoPor: string
  createdAt: string
  finalizadoEm: string | null
  items: ChecklistItem[]
}

export default function QaChecklistPage() {
  const params = useParams<{ token: string }>()
  const [data, setData] = useState<ChecklistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/public/qa/${params.token}`)
        if (res.status === 404) {
          setError("Checklist não encontrado. Verifique se o link está correto.")
          setLoading(false)
          return
        }
        if (!res.ok) {
          setError("Erro ao carregar checklist.")
          setLoading(false)
          return
        }
        const json = await res.json()
        setData(json)
      } catch {
        setError("Erro ao conectar com o servidor.")
      }
      setLoading(false)
    }
    fetchData()
  }, [params.token])

  const saveItem = useCallback(
    async (itemId: string, updates: { marcado?: boolean; anotacoes?: string }) => {
      if (!data || data.status === "FINALIZADO") return
      setSaving(true)
      try {
        const res = await fetch(`/api/public/qa/${params.token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, ...updates }),
        })
        if (res.ok) {
          setLastSaved(new Date())
        }
      } catch {
        // Tentará novamente na próxima alteração
      }
      setSaving(false)
    },
    [data, params.token]
  )

  function handleCheck(itemId: string, marcado: boolean) {
    if (!data || data.status === "FINALIZADO") return
    setData({
      ...data,
      items: data.items.map((item) =>
        item.id === itemId ? { ...item, marcado } : item
      ),
    })
    saveItem(itemId, { marcado })
  }

  function handleAnotacoes(itemId: string, anotacoes: string) {
    if (!data || data.status === "FINALIZADO") return
    setData({
      ...data,
      items: data.items.map((item) =>
        item.id === itemId ? { ...item, anotacoes } : item
      ),
    })
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveItem(itemId, { anotacoes })
    }, 1000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 mx-auto" />
          <p className="mt-4 text-slate-600">Carregando checklist...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 text-lg font-medium mb-2">Oops!</p>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const isFinalized = data.status === "FINALIZADO"
  const totalItems = data.items.length
  const checkedItems = data.items.filter((i) => i.marcado).length
  const progressPct = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 py-4">
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-lg font-bold text-slate-900">Checklist de Teste</h1>
          <p className="text-xs text-slate-500">Controle de Qualidade</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Header do relatório */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{data.titulo}</h2>
              <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
                <span>Por {data.criadoPor}</span>
                <span>-</span>
                <span>
                  {new Date(data.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>
            {isFinalized && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                <p className="text-amber-800 font-medium text-sm">
                  Relatório finalizado
                </p>
                <p className="text-amber-600 text-xs">Não é possível editar.</p>
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Progresso</span>
              <span>
                {checkedItems}/{totalItems} concluídas ({Math.round(progressPct)}
                %)
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  progressPct === 100 ? "bg-green-500" : "bg-blue-600"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {!isFinalized && (
            <div className="mt-3 text-xs text-slate-500 flex items-center gap-2">
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Salvando...
                </>
              ) : lastSaved ? (
                <span className="text-green-600">Salvo automaticamente</span>
              ) : (
                <span>As alterações são salvas automaticamente</span>
              )}
            </div>
          )}
        </div>

        {/* Itens do checklist */}
        <div className="space-y-2">
          {data.items.map((item, idx) => (
            <div
              key={item.id}
              className={`bg-white rounded-lg shadow transition-colors ${
                item.marcado
                  ? "border-l-4 border-l-green-500"
                  : "border-l-4 border-l-transparent"
              }`}
            >
              <div className="px-5 py-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.marcado}
                    onChange={(e) => handleCheck(item.id, e.target.checked)}
                    disabled={isFinalized}
                    className="mt-0.5 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                  />
                  <div className="flex-1">
                    <span
                      className={`font-medium ${
                        item.marcado
                          ? "text-slate-400 line-through"
                          : "text-slate-900"
                      }`}
                    >
                      {idx + 1}. {item.taskNome}
                    </span>
                    {item.taskDescricao && (
                      <p className="text-sm text-slate-500 mt-0.5">
                        {item.taskDescricao}
                      </p>
                    )}
                  </div>
                </label>

                <div className="mt-3 ml-8">
                  <textarea
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50 disabled:text-slate-500"
                    rows={2}
                    value={item.anotacoes || ""}
                    onChange={(e) => handleAnotacoes(item.id, e.target.value)}
                    disabled={isFinalized}
                    placeholder="Anotações adicionais..."
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Status final */}
        <div className="bg-white rounded-lg shadow p-6 text-center">
          {progressPct === 100 ? (
            <div>
              <p className="text-green-600 font-semibold text-lg mb-2">
                Todas as tasks foram concluídas!
              </p>
              <p className="text-slate-600 text-sm">
                O checklist pode ser finalizado pelo administrador.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-slate-700 font-medium mb-1">
                {checkedItems} de {totalItems} tasks concluídas
              </p>
              <p className="text-slate-500 text-sm">
                Suas alterações são salvas automaticamente.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
