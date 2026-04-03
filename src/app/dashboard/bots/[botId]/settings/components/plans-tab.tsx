"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, CreditCard } from "lucide-react";

import {
  getSubscriptionPlans,
  deleteSubscriptionPlan,
  toggleSubscriptionPlan,
} from "@/server/actions/subscription-plan.actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";

import { PlanFormDialog } from "./plan-form-dialog";
import { formatCurrency } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types";

interface PlansTabProps {
  botId: string;
}

const periodLabels: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export function PlansTab({ botId }: PlansTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadPlans = useCallback(async () => {
    try {
      const result = await getSubscriptionPlans(botId);
      if (result.success && result.data) {
        setPlans(result.data);
      }
    } catch {
      toast.error("Erro ao carregar planos");
    } finally {
      setIsLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  async function handleToggle(planId: string) {
    const result = await toggleSubscriptionPlan(planId);
    if (!result.success) {
      toast.error(result.error ?? "Erro ao alterar status");
      return;
    }
    await loadPlans();
  }

  async function handleDelete() {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const result = await deleteSubscriptionPlan(deleteId);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao excluir plano");
        return;
      }
      toast.success("Plano excluído!");
      await loadPlans();
    } catch {
      toast.error("Erro ao excluir plano");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  }

  function openEdit(plan: SubscriptionPlan) {
    setEditingPlan(plan);
    setFormOpen(true);
  }

  function openCreate() {
    setEditingPlan(null);
    setFormOpen(true);
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
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Planos de Assinatura
            </CardTitle>
            <CardDescription className="text-slate-400">
              Gerencie os planos de acesso recorrente
            </CardDescription>
          </div>
          <Button
            onClick={openCreate}
            size="sm"
            className="bg-primary-600 hover:bg-primary-700 text-white"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Novo Plano
          </Button>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Nenhum plano cadastrado</p>
              <p className="text-xs text-slate-400 mt-1">
                Crie seu primeiro plano de assinatura
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map((plan) => {
                const benefits = (plan.benefits as string[]) ?? [];
                return (
                  <div
                    key={plan.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      plan.isActive
                        ? "border-slate-200 bg-white"
                        : "border-slate-200/50 bg-slate-50/50 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-slate-900">
                            {plan.name}
                          </h3>
                          <Badge
                            variant={plan.isActive ? "default" : "secondary"}
                            className={
                              plan.isActive
                                ? "bg-emerald-100 text-emerald-700 text-xs"
                                : "bg-slate-100 text-slate-500 text-xs"
                            }
                          >
                            {plan.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                          {plan.includesLiveAccess && (
                            <Badge className="bg-violet-100 text-violet-700 text-xs">
                              Live
                            </Badge>
                          )}
                        </div>
                        {plan.description && (
                          <p className="text-sm text-slate-500 mt-1">
                            {plan.description}
                          </p>
                        )}
                        <p className="text-lg font-semibold text-slate-900 mt-2">
                          {formatCurrency(parseFloat(plan.price.toString()))}
                          <span className="text-sm font-normal text-slate-400">
                            {" "}
                            / {periodLabels[plan.period] ?? plan.period}
                          </span>
                        </p>
                        {benefits.length > 0 && (
                          <ul className="mt-2 space-y-0.5">
                            {benefits.map((b, i) => (
                              <li
                                key={i}
                                className="text-xs text-slate-500 flex items-center gap-1.5"
                              >
                                <span className="text-emerald-500">&#10003;</span>
                                {b}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Switch
                          checked={plan.isActive}
                          onCheckedChange={() => handleToggle(plan.id)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(plan)}
                          className="text-slate-400 hover:text-slate-700 h-8 w-8 p-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(plan.id)}
                          className="text-slate-400 hover:text-red-500 h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PlanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        botId={botId}
        plan={editingPlan}
        onSaved={loadPlans}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="border-slate-200/60 bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Plano</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              Tem certeza que deseja excluir este plano? Assinantes ativos não
              serão afetados, mas novos usuários não poderão assinar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200 bg-transparent text-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
