"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { formatDate, formatCurrency } from "@/lib/utils";

type SubscriberRow = {
  id: string;
  botId: string;
  telegramUserId: number;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  totalSpent: string;
};

const columns: ColumnDef<SubscriberRow>[] = [
  {
    accessorKey: "telegramFirstName",
    header: "Nome",
    cell: ({ row }) => (
      <span className="text-slate-800">
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
    accessorKey: "totalSpent",
    header: "Total Gasto",
    cell: ({ row }) => (
      <span className="font-medium text-emerald-600">
        {formatCurrency(parseFloat(row.original.totalSpent))}
      </span>
    ),
  },
];

interface SubscribersTableProps {
  subscribers: SubscriberRow[];
}

export function SubscribersTable({ subscribers }: SubscribersTableProps) {
  return (
    <DataTable
      columns={columns}
      data={subscribers}
      searchKey="telegramFirstName"
      pagination={false}
    />
  );
}
