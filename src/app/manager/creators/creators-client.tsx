"use client";

import Link from "next/link";
import { Crown, Eye } from "lucide-react";

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
import { formatCurrency, formatDate } from "@/lib/utils";

type CreatorRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
  managerFeePercent: number | null;
  createdAt: string;
  activeBotCount: number;
  totalBotCount: number;
  managerEarnings: string;
  creatorNet: string;
};

export function ManagerCreatorsClient({ creators }: { creators: CreatorRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Creators</h1>
        <p className="text-sm text-slate-500 mt-1">
          {creators.length} creator(s) sob sua gestão. Para associar novos
          creators, peça ao administrador.
        </p>
      </div>

      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sua taxa</TableHead>
                <TableHead>Bots</TableHead>
                <TableHead>Líquido do creator</TableHead>
                <TableHead>Sua receita</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="text-right pr-6">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creators.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                    Nenhum creator associado a você ainda.
                  </TableCell>
                </TableRow>
              )}
              {creators.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-6">
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        c.isActive
                          ? "bg-emerald-100 text-emerald-600 text-xs"
                          : "bg-slate-100 text-slate-500 text-xs"
                      }
                    >
                      {c.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {c.managerFeePercent?.toFixed(1) ?? "—"}%
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {c.activeBotCount}/{c.totalBotCount}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-emerald-600">
                    {formatCurrency(parseFloat(c.creatorNet))}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-amber-700">
                    <Crown className="inline h-3.5 w-3.5 mr-1" />
                    {formatCurrency(parseFloat(c.managerEarnings))}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {formatDate(new Date(c.createdAt))}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/manager/creators/${c.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
