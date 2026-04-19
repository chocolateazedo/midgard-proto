"use client"

import { useState, useEffect } from "react"
import {
  getQaTasks,
  createQaTask,
  updateQaTask,
  deleteQaTask,
} from "@/server/actions/qa.actions"
import { Loader2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react"

interface QaTask {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  ordem: number
}

export default function QaConfiguracoesPage() {
  const [tasks, setTasks] = useState<QaTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<QaTask | null>(null)
  const [formData, setFormData] = useState({ nome: "", descricao: "", ordem: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    loadTasks()
  }, [])

  async function loadTasks() {
    const result = await getQaTasks()
    if (result.success && result.data) {
      setTasks(result.data)
    }
    setLoading(false)
  }

  function openNewForm() {
    setEditingTask(null)
    setFormData({ nome: "", descricao: "", ordem: 0 })
    setShowForm(true)
    setError("")
  }

  function openEditForm(task: QaTask) {
    setEditingTask(task)
    setFormData({ nome: task.nome, descricao: task.descricao || "", ordem: task.ordem })
    setShowForm(true)
    setError("")
  }

  async function handleSave() {
    if (!formData.nome.trim()) {
      setError("Nome é obrigatório")
      return
    }
    setSaving(true)
    setError("")

    const result = editingTask
      ? await updateQaTask(editingTask.id, {
          nome: formData.nome,
          descricao: formData.descricao || undefined,
          ordem: formData.ordem,
        })
      : await createQaTask({
          nome: formData.nome,
          descricao: formData.descricao || undefined,
          ordem: formData.ordem,
        })

    if (result.success) {
      setShowForm(false)
      setEditingTask(null)
      await loadTasks()
    } else {
      setError(result.error || "Erro ao salvar")
    }
    setSaving(false)
  }

  async function handleToggle(task: QaTask) {
    await updateQaTask(task.id, { ativo: !task.ativo })
    await loadTasks()
  }

  async function handleDelete(task: QaTask) {
    if (!confirm(`Deseja excluir "${task.nome}"?`)) return
    await deleteQaTask(task.id)
    await loadTasks()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const activeTasks = tasks.filter((t) => t.ativo)
  const inactiveTasks = tasks.filter((t) => !t.ativo)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configurações de QA</h1>
          <p className="text-slate-600 mt-1">
            Cadastre as tasks de teste que serão incluídas nos relatórios de controle de qualidade.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          Tasks de Teste
          {activeTasks.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-100 text-primary-800">
              {activeTasks.length} ativa{activeTasks.length !== 1 ? "s" : ""}
            </span>
          )}
        </h2>
        <button
          onClick={openNewForm}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} /> Nova Task
        </button>
      </div>

      {showForm && (
        <div className="mb-6 border rounded-lg p-4 bg-slate-50">
          <h3 className="font-semibold text-slate-900 mb-3">
            {editingTask ? "Editar Task" : "Nova Task de Teste"}
          </h3>
          {error && (
            <div className="p-3 mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nome *
              </label>
              <input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Verificar fluxo de login"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Ordem
              </label>
              <input
                type="number"
                value={formData.ordem}
                onChange={(e) =>
                  setFormData({ ...formData, ordem: parseInt(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descrição (opcional)
            </label>
            <textarea
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descrição detalhada da task de teste..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editingTask ? "Salvar Alterações" : "Adicionar"}
            </button>
            <button
              onClick={() => {
                setShowForm(false)
                setEditingTask(null)
              }}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {tasks.length > 0 ? (
        <div className="space-y-2">
          {[...activeTasks, ...inactiveTasks].map((task) => (
            <div
              key={task.id}
              className={`flex items-center justify-between border rounded-lg px-4 py-3 ${
                task.ativo ? "bg-white" : "bg-slate-50 opacity-60"
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{task.nome}</span>
                  {!task.ativo && (
                    <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full">
                      Inativa
                    </span>
                  )}
                  {task.ordem > 0 && (
                    <span className="text-xs text-slate-400">#{task.ordem}</span>
                  )}
                </div>
                {task.descricao && (
                  <p className="text-sm text-slate-500 mt-0.5">{task.descricao}</p>
                )}
              </div>
              <div className="flex gap-1 ml-4">
                <button
                  onClick={() => openEditForm(task)}
                  className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  title="Editar"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleToggle(task)}
                  className={`p-2 rounded-lg transition-colors ${
                    task.ativo
                      ? "text-slate-400 hover:text-yellow-600 hover:bg-yellow-50"
                      : "text-slate-400 hover:text-green-600 hover:bg-green-50"
                  }`}
                  title={task.ativo ? "Inativar" : "Ativar"}
                >
                  {task.ativo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                </button>
                <button
                  onClick={() => handleDelete(task)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Excluir"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <p>Nenhuma task de teste cadastrada.</p>
          {!showForm && (
            <button
              onClick={openNewForm}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Adicionar primeira task
            </button>
          )}
        </div>
      )}
    </div>
  )
}
