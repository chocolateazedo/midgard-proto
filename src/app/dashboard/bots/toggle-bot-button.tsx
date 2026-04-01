"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Power, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { toggleBot } from "@/server/actions/bot.actions";
import { Button } from "@/components/ui/button";

interface ToggleBotButtonProps {
  botId: string;
  isActive: boolean;
}

export function ToggleBotButton({ botId, isActive }: ToggleBotButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleToggle() {
    setLoading(true);
    try {
      const result = await toggleBot(botId);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao alterar status do bot");
        return;
      }
      toast.success(
        result.data?.isActive ? "Bot ativado com sucesso!" : "Bot desativado."
      );
      router.refresh();
    } catch {
      toast.error("Erro ao alterar status do bot");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      className={
        isActive
          ? "text-red-600 hover:text-red-300 hover:bg-red-500/10 px-2"
          : "text-emerald-600 hover:text-emerald-300 hover:bg-emerald-500/10 px-2"
      }
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Power className="h-4 w-4" />
      )}
    </Button>
  );
}
