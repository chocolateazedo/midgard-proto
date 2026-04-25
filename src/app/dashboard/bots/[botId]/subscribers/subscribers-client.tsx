"use client";

import { useRouter, useParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import * as React from "react";

type SubscriberRow = {
  id: string;
  botId: string;
  telegramUserId: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  totalSpent: string;
  activePlanName: string | null;
};

function buildColumns(showTotalSpent: boolean): ColumnDef<SubscriberRow>[] {
  const cols: ColumnDef<SubscriberRow>[] = [
    {
      accessorKey: "telegramFirstName",
      header: "Nome",
      cell: ({ row }) => (
        <span className="text-slate-800 font-medium">
          {row.original.telegramFirstName ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "telegramUsername",
      header: "Username",
      cell: ({ row }) =>
        row.original.telegramUsername ? (
          <span className="text-primary-600">@{row.original.telegramUsername}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      accessorKey: "firstSeenAt",
      header: "Primeiro Acesso",
      cell: ({ row }) => (
        <span className="text-slate-500 text-sm">
          {row.original.firstSeenAt ? formatDate(new Date(row.original.firstSeenAt)) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "lastSeenAt",
      header: "Último Acesso",
      cell: ({ row }) => (
        <span className="text-slate-500 text-sm">
          {row.original.lastSeenAt ? formatDate(new Date(row.original.lastSeenAt)) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "activePlanName",
      header: "Plano",
      cell: ({ row }) =>
        row.original.activePlanName ? (
          <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs font-medium">
            {row.original.activePlanName}
          </Badge>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        ),
    },
  ];
  if (showTotalSpent) {
    cols.push({
      accessorKey: "totalSpent",
      header: "Total Gasto",
      cell: ({ row }) => (
        <span className="font-medium text-emerald-600">
          {formatCurrency(parseFloat(row.original.totalSpent))}
        </span>
      ),
    });
  }
  cols.push({
    id: "actions",
    cell: () => <ChevronRight className="h-4 w-4 text-slate-300" />,
  });
  return cols;
}

interface SubscribersTableProps {
  subscribers: SubscriberRow[];
  basePath?: string;
  // Valor bruto gasto pelo seguidor. Exibido só pra staff admin.
  showTotalSpent?: boolean;
}

export function SubscribersTable({
  subscribers,
  basePath,
  showTotalSpent = false,
}: SubscribersTableProps) {
  const router = useRouter();
  const params = useParams();
  const botId = params.botId as string;
  const prefix = basePath ?? `/dashboard/bots/${botId}`;
  const columns = React.useMemo(() => buildColumns(showTotalSpent), [showTotalSpent]);

  return (
    <DataTable
      columns={columns}
      data={subscribers}
      searchKey="telegramFirstName"
      pagination={false}
      onRowClick={(row) => router.push(`${prefix}/subscribers/${row.id}`)}
    />
  );
}
