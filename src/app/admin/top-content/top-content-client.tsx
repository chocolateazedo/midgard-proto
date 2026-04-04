"use client";

import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  TrendingUp,
  Image as ImageIcon,
  Video,
  File,
  Package,
} from "lucide-react";

function getTypeIcon(type: string) {
  switch (type) {
    case "image":
      return <ImageIcon className="h-4 w-4 text-primary-600" />;
    case "video":
      return <Video className="h-4 w-4 text-blue-400" />;
    case "bundle":
      return <Package className="h-4 w-4 text-amber-600" />;
    default:
      return <File className="h-4 w-4 text-slate-500" />;
  }
}

function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    image: "Imagem",
    video: "Vídeo",
    file: "Arquivo",
    bundle: "Bundle",
  };
  return labels[type] ?? type;
}

type TopContentItem = {
  contentId: string;
  title: string;
  type: string;
  price: string;
  botName: string;
  botUsername: string | null;
  creatorName: string;
  accessCount: number;
  totalRevenue: string;
};

interface TopContentClientProps {
  content: TopContentItem[];
  currentPeriod: string;
  currentIncludeFree: boolean;
}

export function TopContentClient({
  content,
  currentPeriod,
  currentIncludeFree,
}: TopContentClientProps) {
  const router = useRouter();

  function updateFilters(period?: string, includeFree?: boolean) {
    const p = period ?? currentPeriod;
    const f = includeFree ?? currentIncludeFree;
    const params = new URLSearchParams();
    params.set("period", p);
    if (f) params.set("free", "true");
    router.push(`/admin/top-content?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Top Conteúdos</h1>
        <p className="text-sm text-slate-400">
          Conteúdos mais acessados da plataforma
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Período</Label>
          <Select
            value={currentPeriod}
            onValueChange={(v) => updateFilters(v, undefined)}
          >
            <SelectTrigger className="w-40 bg-white border-slate-200 text-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="daily" className="text-slate-900">Hoje</SelectItem>
              <SelectItem value="weekly" className="text-slate-900">Últimos 7 dias</SelectItem>
              <SelectItem value="monthly" className="text-slate-900">Este mês</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pt-5">
          <Switch
            id="include-free"
            checked={currentIncludeFree}
            onCheckedChange={(checked) => updateFilters(undefined, checked)}
            className="data-[state=checked]:bg-primary-600"
          />
          <Label htmlFor="include-free" className="text-sm text-slate-700 cursor-pointer">
            Incluir gratuitos
          </Label>
        </div>
      </div>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary-600" />
            Ranking ({content.length} conteúdos)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {content.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">
                Nenhum conteúdo acessado neste período
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {content.map((item, index) => {
                const price = parseFloat(item.price);
                const revenue = parseFloat(item.totalRevenue);
                const isFree = price === 0;

                return (
                  <div
                    key={item.contentId}
                    className="flex items-center gap-3 rounded-lg border border-slate-200/60 p-3 hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Posição */}
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                      <span className={`text-sm font-bold ${
                        index === 0 ? "text-amber-500" :
                        index === 1 ? "text-slate-400" :
                        index === 2 ? "text-amber-700" :
                        "text-slate-400"
                      }`}>
                        {index + 1}
                      </span>
                    </div>

                    {/* Ícone do tipo */}
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 shrink-0">
                      {getTypeIcon(item.type)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {item.title}
                        </p>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 text-xs shrink-0">
                          {getTypeLabel(item.type)}
                        </Badge>
                        {isFree && (
                          <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-xs shrink-0">
                            Grátis
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {item.botName}
                        {item.botUsername && <span className="text-slate-300"> @{item.botUsername}</span>}
                        <span className="text-slate-300"> &middot; </span>
                        {item.creatorName}
                      </p>
                    </div>

                    {/* Métricas */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900">
                        {item.accessCount} acesso{item.accessCount !== 1 ? "s" : ""}
                      </p>
                      {!isFree && (
                        <p className="text-xs text-emerald-600 font-medium">
                          {formatCurrency(revenue)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
