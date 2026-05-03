"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Plus,
  Loader2,
  Image as ImageIcon,
  Video,
  File as FileIcon,
  Package,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  LayoutGrid,
  List as ListIcon,
  Calendar,
  Crown,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listContentForBotTab,
  setContentAvailability,
  deleteContent,
  updateContent,
  cancelScheduledPublish,
  reschedulePublish,
} from "@/server/actions/content.actions";
import type { SerializedContentItem } from "@/server/queries/content";
import { formatCurrency } from "@/lib/utils";

type Tab = "subscribers" | "individual" | "scheduled";
type View = "cards" | "list";

interface ContentManagerProps {
  botId: string;
  basePath?: string;
}

const PAGE_SIZE = 20;

const TAB_LABELS: Record<Tab, string> = {
  subscribers: "Para assinantes",
  individual: "Individuais",
  scheduled: "Agendadas",
};

function getTypeIcon(type: string, className = "h-5 w-5") {
  switch (type) {
    case "image":
      return <ImageIcon className={`${className} text-primary-600`} />;
    case "video":
      return <Video className={`${className} text-blue-500`} />;
    case "bundle":
      return <Package className={`${className} text-amber-600`} />;
    default:
      return <FileIcon className={`${className} text-slate-500`} />;
  }
}

function formatDateTime(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContentManager({
  botId,
  basePath = "/dashboard/bots",
}: ContentManagerProps) {
  const [tab, setTab] = useState<Tab>("subscribers");
  const [view, setView] = useState<View>("cards");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SerializedContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [editItem, setEditItem] = useState<SerializedContentItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rescheduleItem, setRescheduleItem] =
    useState<SerializedContentItem | null>(null);

  const publishHref = `${basePath}/${botId}/publish`;

  const load = useCallback(
    async (currentTab: Tab, currentPage: number) => {
      setLoading(true);
      const res = await listContentForBotTab(
        botId,
        currentTab,
        currentPage,
        PAGE_SIZE,
      );
      if (res.success && res.data) {
        setItems(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error(res.error ?? "Erro ao carregar conteúdo");
      }
      setLoading(false);
    },
    [botId],
  );

  useEffect(() => {
    load(tab, page);
  }, [tab, page, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reload = () => load(tab, page);

  function handleTabChange(next: string) {
    setTab(next as Tab);
    setPage(1);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="subscribers">
              <Crown className="h-4 w-4 mr-1.5" />
              {TAB_LABELS.subscribers}
            </TabsTrigger>
            <TabsTrigger value="individual">
              <Tag className="h-4 w-4 mr-1.5" />
              {TAB_LABELS.individual}
            </TabsTrigger>
            <TabsTrigger value="scheduled">
              <Calendar className="h-4 w-4 mr-1.5" />
              {TAB_LABELS.scheduled}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            <Button
              type="button"
              size="sm"
              variant={view === "cards" ? "default" : "ghost"}
              className={view === "cards" ? "bg-slate-100 text-slate-900 hover:bg-slate-200" : "text-slate-500"}
              onClick={() => setView("cards")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "list" ? "default" : "ghost"}
              className={view === "list" ? "bg-slate-100 text-slate-900 hover:bg-slate-200" : "text-slate-500"}
              onClick={() => setView("list")}
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
          <Button asChild className="bg-primary-600 hover:bg-primary-700 text-white">
            <Link href={publishHref}>
              <Plus className="mr-1.5 h-4 w-4" />
              Novo conteúdo
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState tab={tab} publishHref={publishHref} />
      ) : view === "cards" ? (
        <CardsView
          items={items}
          tab={tab}
          onEdit={(it) => setEditItem(it)}
          onDelete={(id) => setDeleteId(id)}
          onToggleAvailability={async (it) => {
            const next = it.availability === "available" ? "inactive" : "available";
            const res = await setContentAvailability(it.id, next);
            if (res.success) {
              toast.success(
                next === "available" ? "Conteúdo disponível" : "Conteúdo inativado",
              );
              reload();
            } else {
              toast.error(res.error ?? "Erro");
            }
          }}
          onReschedule={(it) => setRescheduleItem(it)}
          onCancelSchedule={async (id) => {
            const res = await cancelScheduledPublish(id);
            if (res.success) {
              toast.success("Agendamento cancelado");
              reload();
            } else {
              toast.error(res.error ?? "Erro");
            }
          }}
        />
      ) : (
        <ListView
          items={items}
          tab={tab}
          onEdit={(it) => setEditItem(it)}
          onDelete={(id) => setDeleteId(id)}
          onToggleAvailability={async (it) => {
            const next = it.availability === "available" ? "inactive" : "available";
            const res = await setContentAvailability(it.id, next);
            if (res.success) {
              toast.success(
                next === "available" ? "Conteúdo disponível" : "Conteúdo inativado",
              );
              reload();
            } else {
              toast.error(res.error ?? "Erro");
            }
          }}
          onReschedule={(it) => setRescheduleItem(it)}
          onCancelSchedule={async (id) => {
            const res = await cancelScheduledPublish(id);
            if (res.success) {
              toast.success("Agendamento cancelado");
              reload();
            } else {
              toast.error(res.error ?? "Erro");
            }
          }}
        />
      )}

      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Página {page} de {totalPages} — {total} item(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <EditDialog
        item={editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => {
          setEditItem(null);
          reload();
        }}
      />

      <RescheduleDialog
        item={rescheduleItem}
        onClose={() => setRescheduleItem(null)}
        onSaved={() => {
          setRescheduleItem(null);
          reload();
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conteúdo?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O arquivo é removido do storage e
              o registro do banco também.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (!deleteId) return;
                const res = await deleteContent(deleteId);
                if (res.success) {
                  toast.success("Conteúdo excluído");
                  reload();
                } else {
                  toast.error(res.error ?? "Erro ao excluir");
                }
                setDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmptyState({ tab, publishHref }: { tab: Tab; publishHref: string }) {
  const messages: Record<Tab, { title: string; subtitle: string }> = {
    subscribers: {
      title: "Nenhum conteúdo pra assinantes",
      subtitle: "Conteúdo aqui é postado no canal vinculado, sem cobrança.",
    },
    individual: {
      title: "Nenhum conteúdo individual",
      subtitle: "Conteúdo unitário aparece em /catalogo no bot pra compra.",
    },
    scheduled: {
      title: "Nenhuma publicação agendada",
      subtitle: "Crie um conteúdo com horário pra ele aparecer aqui.",
    },
  };
  const { title, subtitle } = messages[tab];
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white py-16 text-center">
      <p className="text-lg font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      <Button
        asChild
        className="mt-6 bg-primary-600 hover:bg-primary-700 text-white"
      >
        <Link href={publishHref}>
          <Plus className="mr-2 h-4 w-4" />
          Novo conteúdo
        </Link>
      </Button>
    </div>
  );
}

interface ItemActionsProps {
  items: SerializedContentItem[];
  tab: Tab;
  onEdit: (item: SerializedContentItem) => void;
  onDelete: (id: string) => void;
  onToggleAvailability: (item: SerializedContentItem) => Promise<void>;
  onReschedule: (item: SerializedContentItem) => void;
  onCancelSchedule: (id: string) => Promise<void>;
}

function CardsView({
  items,
  tab,
  onEdit,
  onDelete,
  onToggleAvailability,
  onReschedule,
  onCancelSchedule,
}: ItemActionsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.id} className="bg-white border-slate-200/60 rounded-xl">
          <div className="flex h-32 items-center justify-center rounded-t-lg bg-slate-50 border-b border-slate-200/60">
            {getTypeIcon(item.type, "h-10 w-10")}
          </div>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {item.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {item.deliveryMode === "ondemand"
                    ? formatCurrency(item.price)
                    : "Assinante"}
                </p>
              </div>
              {tab !== "scheduled" && (
                <Badge
                  variant="outline"
                  className={
                    item.availability === "available"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 text-xs shrink-0"
                      : "bg-slate-100 text-slate-500 border-slate-300 text-xs shrink-0"
                  }
                >
                  {item.availability === "available" ? "Disponível" : "Inativo"}
                </Badge>
              )}
            </div>

            {item.description && (
              <p className="text-xs text-slate-500 line-clamp-2">
                {item.description}
              </p>
            )}

            <div className="text-xs text-slate-400">
              {tab === "scheduled"
                ? `Agendado pra ${formatDateTime(item.scheduledAt)}`
                : item.publishedAt
                  ? `Publicado em ${formatDateTime(item.publishedAt)}`
                  : `Criado em ${formatDateTime(item.createdAt)}`}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {tab === "scheduled" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onReschedule(item)}
                  >
                    <Calendar className="h-4 w-4 mr-1" />
                    Reagendar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => onCancelSchedule(item.id)}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(item)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onToggleAvailability(item)}
                  >
                    {item.availability === "available" ? (
                      <>
                        <EyeOff className="h-4 w-4 mr-1" />
                        Inativar
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-1" />
                        Disponibilizar
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => onDelete(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ListView({
  items,
  tab,
  onEdit,
  onDelete,
  onToggleAvailability,
  onReschedule,
  onCancelSchedule,
}: ItemActionsProps) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Preço</TableHead>
            {tab !== "scheduled" && <TableHead>Status</TableHead>}
            <TableHead>{tab === "scheduled" ? "Agendado" : "Criado"}</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{getTypeIcon(item.type, "h-4 w-4")}</TableCell>
              <TableCell className="font-medium">
                <div className="text-sm text-slate-900 truncate max-w-xs">
                  {item.title}
                </div>
                {item.description && (
                  <div className="text-xs text-slate-500 truncate max-w-xs">
                    {item.description}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-sm capitalize text-slate-600">
                {item.type}
              </TableCell>
              <TableCell className="text-sm text-slate-600">
                {item.deliveryMode === "ondemand"
                  ? formatCurrency(item.price)
                  : "—"}
              </TableCell>
              {tab !== "scheduled" && (
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      item.availability === "available"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300 text-xs"
                        : "bg-slate-100 text-slate-500 border-slate-300 text-xs"
                    }
                  >
                    {item.availability === "available" ? "Disponível" : "Inativo"}
                  </Badge>
                </TableCell>
              )}
              <TableCell className="text-xs text-slate-500">
                {tab === "scheduled"
                  ? formatDateTime(item.scheduledAt)
                  : formatDateTime(item.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {tab === "scheduled" ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onReschedule(item)}
                      >
                        <Calendar className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => onCancelSchedule(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onToggleAvailability(item)}
                      >
                        {item.availability === "available" ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EditDialog({
  item,
  onClose,
  onSaved,
}: {
  item: SerializedContentItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"ondemand" | "catalog">(
    "catalog",
  );
  const [availability, setAvailability] = useState<"available" | "inactive">(
    "available",
  );
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description ?? "");
      setPrice(String(item.price));
      setDeliveryMode(item.deliveryMode);
      setAvailability(item.availability);
    }
  }, [item]);

  const open = !!item;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar conteúdo</DialogTitle>
          <DialogDescription>
            Editar perde a idempotência com o backup do canal — o item original
            não será re-importado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select
              value={deliveryMode}
              onValueChange={(v) =>
                setDeliveryMode(v as "ondemand" | "catalog")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="catalog">Para assinantes</SelectItem>
                <SelectItem value="ondemand">Individual (com preço)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {deliveryMode === "ondemand" && (
            <div>
              <Label>Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label>Disponibilidade</Label>
            <Select
              value={availability}
              onValueChange={(v) =>
                setAvailability(v as "available" | "inactive")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Disponível</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!item) return;
              startSaving(async () => {
                const res = await updateContent(item.id, {
                  title,
                  description: description || undefined,
                  price:
                    deliveryMode === "ondemand"
                      ? parseFloat(price || "0")
                      : 0,
                  deliveryMode,
                  availability,
                });
                if (res.success) {
                  toast.success("Conteúdo atualizado");
                  onSaved();
                } else {
                  toast.error(res.error ?? "Erro ao salvar");
                }
              });
            }}
            disabled={saving || !title.trim()}
            className="bg-primary-600 hover:bg-primary-700 text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({
  item,
  onClose,
  onSaved,
}: {
  item: SerializedContentItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [when, setWhen] = useState("");
  const [saving, startSaving] = useTransition();

  const initial = useMemo(() => {
    if (!item?.scheduledAt) return "";
    const d = new Date(item.scheduledAt);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  }, [item]);

  useEffect(() => {
    setWhen(initial);
  }, [initial]);

  const open = !!item;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reagendar publicação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Novo horário</Label>
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!item) return;
              const target = new Date(when);
              if (Number.isNaN(target.getTime()) || target.getTime() <= Date.now()) {
                toast.error("Horário inválido — escolha um momento futuro");
                return;
              }
              startSaving(async () => {
                const res = await reschedulePublish(item.id, {
                  scheduledAt: target,
                });
                if (res.success) {
                  toast.success("Reagendado");
                  onSaved();
                } else {
                  toast.error(res.error ?? "Erro");
                }
              });
            }}
            disabled={saving}
            className="bg-primary-600 hover:bg-primary-700 text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
