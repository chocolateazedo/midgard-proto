import Link from "next/link";

import type { SerializedSubscriberDetail, SerializedPurchaseDetail, SerializedSubscriptionDetail } from "@/server/queries/bots";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  User,
  CalendarDays,
  DollarSign,
  ShoppingCart,
  CreditCard,
  Image as ImageIcon,
  Video,
  File,
  Package,
  Clock,
  Crown,
} from "lucide-react";

function getContentTypeIcon(type: string) {
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

function getPurchaseStatusBadge(status: string) {
  switch (status) {
    case "paid":
      return <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-xs">Pago</Badge>;
    case "pending":
      return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-xs">Pendente</Badge>;
    case "expired":
      return <Badge className="bg-slate-100 text-slate-500 text-xs">Expirado</Badge>;
    case "refunded":
      return <Badge className="bg-red-500/20 text-red-600 border-red-500/30 text-xs">Reembolsado</Badge>;
    default:
      return <Badge className="bg-slate-100 text-slate-500 text-xs">{status}</Badge>;
  }
}

function getSubscriptionStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-xs">Ativa</Badge>;
    case "expired":
      return <Badge className="bg-slate-100 text-slate-500 text-xs">Expirada</Badge>;
    case "cancelled":
      return <Badge className="bg-red-500/20 text-red-600 border-red-500/30 text-xs">Cancelada</Badge>;
    default:
      return <Badge className="bg-slate-100 text-slate-500 text-xs">{status}</Badge>;
  }
}

function getPeriodLabel(period: string) {
  const labels: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    semiannual: "Semestral",
    annual: "Anual",
  };
  return labels[period] ?? period;
}

type TimelineEvent = {
  id: string;
  date: string;
  type: "purchase" | "subscription" | "first_seen";
  title: string;
  subtitle: string;
  amount?: number;
  status?: string;
};

function buildTimeline(
  subscriber: { firstSeenAt: string },
  purchases: SerializedPurchaseDetail[],
  subscriptions: SerializedSubscriptionDetail[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: "first-seen",
    date: subscriber.firstSeenAt,
    type: "first_seen",
    title: "Primeiro contato",
    subtitle: "Iniciou o bot pela primeira vez",
  });

  for (const p of purchases) {
    events.push({
      id: `purchase-${p.id}`,
      date: p.paidAt ?? p.createdAt,
      type: "purchase",
      title: p.content?.title ?? "Acesso à Live",
      subtitle: p.status === "paid"
        ? "Comprou conteúdo"
        : p.status === "pending"
          ? "Pagamento pendente"
          : p.status === "refunded"
            ? "Compra reembolsada"
            : "Pagamento expirado",
      amount: p.amount,
      status: p.status,
    });
  }

  for (const s of subscriptions) {
    events.push({
      id: `subscription-${s.id}`,
      date: s.paidAt ?? s.createdAt,
      type: "subscription",
      title: s.plan.name,
      subtitle: s.status === "active"
        ? `Assinatura ${getPeriodLabel(s.plan.period).toLowerCase()} ativa`
        : s.status === "expired"
          ? "Assinatura expirada"
          : "Assinatura cancelada",
      amount: s.amount,
      status: s.status,
    });
  }

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return events;
}

interface SubscriberDetailViewProps {
  subscriber: SerializedSubscriberDetail;
  backHref: string;
}

export function SubscriberDetailView({ subscriber, backHref }: SubscriberDetailViewProps) {
  const activeSubscription = subscriber.subscriptions.find((s) => s.status === "active");
  const daysSinceFirstSeen = Math.floor(
    (Date.now() - new Date(subscriber.firstSeenAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const timeline = buildTimeline(subscriber, subscriber.purchases, subscriber.subscriptions);

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <div className="flex items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-slate-500 hover:text-slate-900 hover:bg-slate-50"
        >
          <Link href={backHref}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      {/* Header com info do assinante */}
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 shrink-0">
          <User className="h-7 w-7 text-primary-600" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">
            {subscriber.telegramFirstName ?? "Usuário"}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            {subscriber.telegramUsername && (
              <span className="text-sm text-primary-600">@{subscriber.telegramUsername}</span>
            )}
            <span className="text-sm text-slate-400">
              ID: {subscriber.telegramUserId}
            </span>
          </div>
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 shrink-0">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Total Gasto</p>
              <p className="text-lg font-bold text-slate-900">{formatCurrency(subscriber.totalSpent)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 shrink-0">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Compras</p>
              <p className="text-lg font-bold text-slate-900">{subscriber.purchaseCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 shrink-0">
              <Crown className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Assinatura</p>
              <p className="text-sm font-bold text-slate-900">
                {activeSubscription ? activeSubscription.plan.name : "Nenhuma"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 shrink-0">
              <CalendarDays className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Dias desde o primeiro acesso</p>
              <p className="text-lg font-bold text-slate-900">{daysSinceFirstSeen}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assinatura ativa */}
      {activeSubscription && (
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Crown className="h-4 w-4 text-purple-600" />
              Assinatura Ativa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Plano</p>
                <p className="text-sm font-medium text-slate-900">{activeSubscription.plan.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Período</p>
                <p className="text-sm font-medium text-slate-900">{getPeriodLabel(activeSubscription.plan.period)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Valor</p>
                <p className="text-sm font-medium text-emerald-600">{formatCurrency(activeSubscription.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Expira em</p>
                <p className="text-sm font-medium text-slate-900">
                  {activeSubscription.endDate ? formatDate(new Date(activeSubscription.endDate)) : "—"}
                </p>
              </div>
            </div>
            {Array.isArray(activeSubscription.plan.benefits) && (activeSubscription.plan.benefits as string[]).length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200/60">
                <p className="text-xs text-slate-400 mb-2">Benefícios</p>
                <div className="flex flex-wrap gap-2">
                  {(activeSubscription.plan.benefits as string[]).map((benefit, i) => (
                    <Badge key={i} variant="secondary" className="bg-purple-50 text-purple-700 text-xs">
                      {benefit}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Histórico de compras */}
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-blue-600" />
              Compras ({subscriber.purchases.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscriber.purchases.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Nenhuma compra realizada</p>
            ) : (
              <div className="space-y-3">
                {subscriber.purchases.map((purchase) => (
                  <div
                    key={purchase.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-200/60 p-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 shrink-0">
                      {getContentTypeIcon(purchase.content?.type ?? "file")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {purchase.content?.title ?? "Acesso à Live"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {purchase.paidAt
                          ? formatDateTime(new Date(purchase.paidAt))
                          : formatDateTime(new Date(purchase.createdAt))}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-semibold text-slate-900">
                        {formatCurrency(purchase.amount)}
                      </span>
                      {getPurchaseStatusBadge(purchase.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico de assinaturas */}
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-purple-600" />
              Assinaturas ({subscriber.subscriptions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscriber.subscriptions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Nenhuma assinatura</p>
            ) : (
              <div className="space-y-3">
                {subscriber.subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-200/60 p-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 shrink-0">
                      <Crown className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {sub.plan.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {getPeriodLabel(sub.plan.period)}
                        {sub.startDate && sub.endDate && (
                          <> &middot; {formatDate(new Date(sub.startDate))} — {formatDate(new Date(sub.endDate))}</>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-semibold text-slate-900">
                        {formatCurrency(sub.amount)}
                      </span>
                      {getSubscriptionStatusBadge(sub.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-600" />
            Linha do Tempo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

            <div className="space-y-6">
              {timeline.map((event) => (
                <div key={event.id} className="relative flex gap-4 pl-10">
                  <div
                    className={`absolute left-[10px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                      event.type === "first_seen"
                        ? "bg-slate-400"
                        : event.type === "subscription"
                          ? "bg-purple-500"
                          : event.status === "paid"
                            ? "bg-emerald-500"
                            : event.status === "pending"
                              ? "bg-amber-500"
                              : "bg-slate-300"
                    }`}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {event.title}
                      </p>
                      {event.amount !== undefined && (
                        <span className="text-sm font-semibold text-slate-700 shrink-0">
                          {formatCurrency(event.amount)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{event.subtitle}</p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {formatDateTime(new Date(event.date))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
