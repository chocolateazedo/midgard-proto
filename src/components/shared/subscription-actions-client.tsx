"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cancelSubscription,
  createManualSubscription,
  listActivePlansForBotAdmin,
} from "@/server/actions/subscription.actions";

interface PlanOption {
  id: string;
  name: string;
  price: number;
  durationDays: number;
}

export function CancelSubscriptionButton({
  subscriptionId,
  planName,
}: {
  subscriptionId: string;
  planName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:bg-red-50 h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Cancelar
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              A assinatura <strong>{planName}</strong> será cancelada
              imediatamente. O usuário será removido do canal vinculado (se
              houver) e receberá uma DM avisando. Sem estorno automático.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const r = await cancelSubscription(subscriptionId);
                  if (r.success) {
                    toast.success("Assinatura cancelada");
                    setOpen(false);
                    router.refresh();
                  } else {
                    toast.error(r.error ?? "Erro ao cancelar");
                  }
                });
              }}
            >
              {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Cancelar assinatura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AddSubscriptionButton({
  botId,
  botUserId,
  botName,
}: {
  botId: string;
  botUserId: string;
  botName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planId, setPlanId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listActivePlansForBotAdmin(botId)
      .then((r) => {
        if (r.success && r.data) {
          setPlans(r.data);
          if (r.data.length > 0) setPlanId(r.data[0].id);
        } else {
          toast.error(r.error ?? "Erro ao carregar planos");
        }
      })
      .finally(() => setLoading(false));
  }, [botId, open]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Incluir assinatura
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Incluir assinatura gratuita</DialogTitle>
            <DialogDescription>
              Inclusão sistêmica sem cobrança. Não gera transação financeira
              nem split. Bot: <strong>{botName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Plano</Label>
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              ) : plans.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">
                  Nenhum plano ativo neste bot.
                </p>
              ) : (
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {p.durationDays}d (
                        {p.price === 0
                          ? "grátis"
                          : `R$ ${p.price.toFixed(2).replace(".", ",")}`}
                        )
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              disabled={pending || !planId || plans.length === 0}
              onClick={() => {
                startTransition(async () => {
                  const r = await createManualSubscription({
                    botId,
                    botUserId,
                    planId,
                  });
                  if (r.success) {
                    toast.success("Assinatura incluída");
                    setOpen(false);
                    router.refresh();
                  } else {
                    toast.error(r.error ?? "Erro ao incluir");
                  }
                });
              }}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Incluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
