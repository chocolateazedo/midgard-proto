// Badge de estado da subconta Woovi (Split Pix).
//
// Reflete o campo wooviSubAccountStatus do User. Quando falhou, exibe
// tooltip/texto com a mensagem de erro pra ajudar a diagnosticar.

import { CheckCircle2, Clock, AlertTriangle, Minus } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export type WooviSubAccountStatus = "none" | "pending" | "active" | "failed"

interface Props {
  status: WooviSubAccountStatus
  error?: string | null
  provisionedAt?: Date | string | null
  hasPixKey: boolean
}

export function WooviSubAccountBadge({ status, error, hasPixKey }: Props) {
  if (!hasPixKey) {
    return (
      <Badge variant="outline" className="text-xs gap-1 border-slate-200 text-slate-500">
        <Minus className="h-3 w-3" />
        Sem chave Pix
      </Badge>
    )
  }
  if (status === "active") {
    return (
      <Badge className="text-xs gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
        <CheckCircle2 className="h-3 w-3" />
        Subconta ativa
      </Badge>
    )
  }
  if (status === "pending") {
    return (
      <Badge className="text-xs gap-1 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
        <Clock className="h-3 w-3" />
        Provisionando
      </Badge>
    )
  }
  if (status === "failed") {
    return (
      <Badge
        className="text-xs gap-1 bg-red-100 text-red-700 border-red-200 hover:bg-red-100"
        title={error ?? undefined}
      >
        <AlertTriangle className="h-3 w-3" />
        Erro ao provisionar
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-xs gap-1 border-slate-200 text-slate-500">
      <Clock className="h-3 w-3" />
      Aguardando provisionamento
    </Badge>
  )
}
