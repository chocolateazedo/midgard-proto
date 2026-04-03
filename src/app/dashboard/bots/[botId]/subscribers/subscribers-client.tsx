"use client";

import { useRouter, useParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

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
    accessorKey: "totalSpent",
    header: "Total Gasto",
    cell: ({ row }) => (
      <span className="font-medium text-emerald-600">
        {formatCurrency(parseFloat(row.original.totalSpent))}
      </span>
    ),
  },
  {
    id: "actions",
    cell: () => (
      <ChevronRight className="h-4 w-4 text-slate-300" />
    ),
  },
];

interface SubscribersTableProps {
  subscribers: SubscriberRow[];
  basePath?: string;
}

export function SubscribersTable({ subscribers, basePath }: SubscribersTableProps) {
  const router = useRouter();
  const params = useParams();
  const botId = params.botId as string;
  const prefix = basePath ?? `/dashboard/bots/${botId}`;

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
