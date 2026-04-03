"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2, ExternalLink, ShoppingBag, RefreshCw, Image } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CatalogTabProps {
  botId: string;
}

interface ContentStats {
  total: number;
  published: number;
  draft: number;
}

export function CatalogTab({ botId }: CatalogTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<ContentStats>({ total: 0, published: 0, draft: 0 });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/bots/${botId}/content`);
        const data = await res.json();
        if (data.success && data.data) {
          const items = data.data as Array<{ isPublished: boolean }>;
          setStats({
            total: items.length,
            published: items.filter((c) => c.isPublished).length,
            draft: items.filter((c) => !c.isPublished).length,
          });
        }
      } catch {
        toast.error("Erro ao carregar dados do catálogo");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [botId]);

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
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Catálogo de Conteúdos
          </CardTitle>
          <CardDescription className="text-slate-400">
            Gerencie fotos, vídeos e arquivos para venda avulsa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Estatísticas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-center">
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{stats.published}</p>
              <p className="text-xs text-slate-500">Publicados</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.draft}</p>
              <p className="text-xs text-slate-500">Rascunhos</p>
            </div>
          </div>

          {/* Link para gerenciar */}
          <Button asChild className="w-full bg-primary-600 hover:bg-primary-700 text-white">
            <Link href={`/dashboard/bots/${botId}/content`}>
              <Image className="mr-2 h-4 w-4" />
              Gerenciar Conteúdos
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Informação sobre compras duplicadas */}
      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Re-entrega Automática
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-sm text-emerald-800">
              Compras duplicadas são re-entregues automaticamente sem cobrança adicional.
            </p>
            <p className="text-xs text-emerald-600 mt-1.5">
              Se um usuário tentar comprar um conteúdo que já adquiriu, o bot reenvia o
              arquivo original sem gerar uma nova cobrança Pix.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
