import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Wallet, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

import { auth } from "@/lib/auth";
import { getFinancialSummaryForUserAsAdmin } from "@/server/actions/financial.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface PageProps {
  params: Promise<{ userId: string }>;
}

function statusBadge(status: "pending" | "succeeded" | "failed") {
  switch (status) {
    case "succeeded":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
          Concluído
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-300">
          Falhou
        </Badge>
      );
    default:
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-300">
          Pendente
        </Badge>
      );
  }
}

export default async function AdminUserWalletPage({ params }: PageProps) {
  const { userId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const res = await getFinancialSummaryForUserAsAdmin(userId);
  if (!res.success || !res.data) notFound();

  const s = res.data;
  const totalIn = s.entries.reduce((a, e) => a + e.amountCents, 0);
  const totalOut = s.withdrawals
    .filter((w) => w.status !== "failed")
    .reduce((a, w) => a + w.amountCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-slate-500 hover:text-slate-900 hover:bg-slate-50"
        >
          <Link href={`/admin/users/${userId}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-emerald-600" />
            Carteira de {s.userName}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {s.userEmail} — <span className="capitalize">{s.userRole}</span>
            {" • "}
            Saldo calculado a partir do DB local (entradas − saídas).
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Saldo derivado</p>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(s.balanceDerivedCents / 100)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              entradas − saques (excluindo failed)
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Total entradas</p>
            <p className="text-2xl font-bold text-emerald-700">
              {formatCurrency(totalIn / 100)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {s.entries.length} transação(ões)
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Total saques</p>
            <p className="text-2xl font-bold text-red-700">
              {formatCurrency(totalOut / 100)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {s.withdrawals.length} solicitação(ões)
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="py-3 flex items-center gap-3">
            <div className="text-xs text-slate-500">Subconta Woovi:</div>
            <Badge
              variant="outline"
              className={
                s.subAccountStatus === "active"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-slate-100 text-slate-500 border-slate-300"
              }
            >
              {s.subAccountStatus}
            </Badge>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200/60 rounded-xl">
          <CardContent className="py-3 flex items-center gap-3">
            <div className="text-xs text-slate-500">Chave Pix:</div>
            <code className="text-xs font-mono text-slate-700">
              {s.pixKey ? s.pixKey : "—"}
            </code>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
            Entradas ({s.entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {s.entries.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              Nenhuma entrada registrada
            </p>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-slate-500">
                        {formatDateTime(new Date(e.occurredAt))}
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {e.kind === "purchase" ? "Compra" : "Assinatura"}
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {e.role}
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {e.description}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-emerald-700">
                        {formatCurrency(e.amountCents / 100)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <ArrowUpFromLine className="h-4 w-4 text-red-600" />
            Saques ({s.withdrawals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {s.withdrawals.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              Nenhum saque registrado
            </p>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Solicitado em</TableHead>
                    <TableHead>Concluído em</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.withdrawals.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="text-xs text-slate-500">
                        {formatDateTime(new Date(w.requestedAt))}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {w.completedAt
                          ? formatDateTime(new Date(w.completedAt))
                          : "—"}
                      </TableCell>
                      <TableCell>{statusBadge(w.status)}</TableCell>
                      <TableCell className="text-right text-sm font-medium text-red-700">
                        {formatCurrency(w.amountCents / 100)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
