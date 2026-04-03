"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createSubscriptionPlan,
  updateSubscriptionPlan,
} from "@/server/actions/subscription-plan.actions";
import type { SubscriptionPlan } from "@/types";

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botId: string;
  plan?: SubscriptionPlan | null;
  onSaved: () => void;
}

const periodOptions = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
];

export function PlanFormDialog({
  open,
  onOpenChange,
  botId,
  plan,
  onSaved,
}: PlanFormDialogProps) {
  const isEditing = !!plan;

  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [period, setPeriod] = useState<string>("monthly");
  const [benefits, setBenefits] = useState<string[]>([]);
  const [newBenefit, setNewBenefit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [includesLiveAccess, setIncludesLiveAccess] = useState(false);

  useEffect(() => {
    if (plan) {
      setName(plan.name);
      setDescription(plan.description ?? "");
      setPrice(parseFloat(plan.price.toString()).toString());
      setPeriod(plan.period);
      setBenefits((plan.benefits as string[]) ?? []);
      setIsActive(plan.isActive);
      setIncludesLiveAccess(plan.includesLiveAccess);
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setPeriod("monthly");
      setBenefits([]);
      setIsActive(true);
      setIncludesLiveAccess(false);
    }
    setNewBenefit("");
  }, [plan, open]);

  function addBenefit() {
    if (!newBenefit.trim()) return;
    setBenefits([...benefits, newBenefit.trim()]);
    setNewBenefit("");
  }

  function removeBenefit(index: number) {
    setBenefits(benefits.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      toast.error("Preço deve ser maior que R$ 0,00");
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && plan) {
        const result = await updateSubscriptionPlan(plan.id, {
          name,
          description: description || undefined,
          price: parseFloat(price),
          period: period as "monthly" | "quarterly" | "semiannual" | "annual",
          benefits,
          isActive,
          includesLiveAccess,
        });
        if (!result.success) {
          toast.error(result.error ?? "Erro ao atualizar plano");
          return;
        }
        toast.success("Plano atualizado!");
      } else {
        const result = await createSubscriptionPlan({
          botId,
          name,
          description: description || undefined,
          price: parseFloat(price),
          period: period as "monthly" | "quarterly" | "semiannual" | "annual",
          benefits,
          isActive,
          includesLiveAccess,
        });
        if (!result.success) {
          toast.error(result.error ?? "Erro ao criar plano");
          return;
        }
        toast.success("Plano criado!");
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200/60 bg-white text-slate-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Plano" : "Novo Plano de Assinatura"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {isEditing
              ? "Altere as informações do plano"
              : "Configure um novo plano de assinatura para o bot"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-slate-700">Nome do Plano</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: VIP, Premium, Básico"
              className="border-slate-200 bg-white text-slate-900 placeholder-slate-400"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-700">Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição curta do plano..."
              rows={2}
              className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700">Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="29.90"
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="border-slate-200 bg-white text-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Benefícios */}
          <div className="space-y-2">
            <Label className="text-slate-700">Benefícios</Label>
            <div className="space-y-2">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded bg-slate-50 px-3 py-1.5 text-sm"
                >
                  <span className="flex-1 text-slate-700">{benefit}</span>
                  <button
                    type="button"
                    onClick={() => removeBenefit(index)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newBenefit}
                  onChange={(e) => setNewBenefit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addBenefit();
                    }
                  }}
                  placeholder="Adicionar benefício..."
                  className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 h-9 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBenefit}
                  className="border-slate-200 h-9 px-3"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <p className="text-sm text-slate-700">Plano ativo</p>
                <p className="text-xs text-slate-400">
                  Planos inativos não aparecem para os usuários
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <p className="text-sm text-slate-700">Inclui acesso à live</p>
                <p className="text-xs text-slate-400">
                  Assinantes deste plano acessam transmissões ao vivo sem pagar extra
                </p>
              </div>
              <Switch
                checked={includesLiveAccess}
                onCheckedChange={setIncludesLiveAccess}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-200 text-slate-700"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-primary-600 hover:bg-primary-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : isEditing ? (
              "Salvar Alterações"
            ) : (
              "Criar Plano"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
