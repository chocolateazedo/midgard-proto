"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

interface SaleRow {
  id: string;
  paidAt: Date | null;
  amount: number;
  platformFee: number;
  creatorNet: number;
  status: string | null;
  content?: { id: string; title: string; type: string | null } | null;
  bot?: { id: string; name: string; username: string | null } | null;
  botUser?: {
    id: string;
    telegramUsername: string | null;
    telegramFirstName: string | null;
  } | null;
}

interface ExportCsvButtonProps {
  sales: SaleRow[];
}

export function ExportCsvButton({ sales }: ExportCsvButtonProps) {
  function handleExport() {
    const headers = [
      "ID",
      "Data",
      "Conteúdo",
      "Bot",
      "Usuário Telegram",
      "Valor Bruto",
      "Taxa Plataforma",
      "Receita Líquida",
      "Status",
    ];

    const rows = sales.map((sale) => [
      sale.id,
      sale.paidAt ? formatDate(sale.paidAt) : "",
      sale.content?.title ?? "",
      sale.bot?.name ?? "",
      sale.botUser?.telegramUsername
        ? `@${sale.botUser.telegramUsername}`
        : sale.botUser?.telegramFirstName ?? "",
      sale.amount,
      sale.platformFee,
      sale.creatorNet,
      sale.status,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `ganhos_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={sales.length === 0}
      className="border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900"
    >
      <Download className="mr-2 h-4 w-4" />
      Exportar CSV
    </Button>
  );
}
