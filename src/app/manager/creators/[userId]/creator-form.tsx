"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateManagedCreator } from "@/server/actions/manager.actions";

interface Props {
  creatorId: string;
  currentFee: number | null;
  currentActive: boolean;
}

export function ManagedCreatorForm({ creatorId, currentFee, currentActive }: Props) {
  const router = useRouter();
  const [fee, setFee] = React.useState(currentFee !== null ? String(currentFee) : "");
  const [active, setActive] = React.useState(currentActive);
  const [saving, setSaving] = React.useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateManagedCreator(creatorId, {
        managerFeePercent: fee ? parseFloat(fee) : undefined,
        isActive: active,
      });
      if (res.success) {
        toast.success("Atualizado");
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="m-fee">Taxa (%)</Label>
        <Input
          id="m-fee"
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
        <p className="text-xs text-slate-400">
          Aplicada sobre o bruto de cada transação deste creator.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
        <div>
          <p className="text-sm text-slate-700">Conta ativa</p>
          <p className="text-xs text-slate-400">Controla login + webhook dos bots</p>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>
      <Button
        type="submit"
        disabled={saving}
        className="w-full bg-primary-600 hover:bg-primary-700 text-white"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
      </Button>
    </form>
  );
}
