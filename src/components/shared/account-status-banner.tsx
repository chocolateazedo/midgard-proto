"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { getUserDocumentInfo } from "@/server/actions/auth.actions";
import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";

export function AccountStatusBanner() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<{
    docStatus: string;
    docRejectReason: string | null;
  } | null>(null);

  useEffect(() => {
    if (session?.user && !session.user.isActive) {
      getUserDocumentInfo().then((result) => {
        if (result.success && result.data) {
          setStatus({
            docStatus: result.data.docStatus,
            docRejectReason: result.data.docRejectReason,
          });
        }
      });
    }
  }, [session]);

  // Não mostrar se está ativo ou se é admin/owner
  if (!session?.user || session.user.isActive) return null;
  if (session.user.role === "owner" || session.user.role === "admin") return null;

  if (status?.docStatus === "rejected") {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
        <p className="text-sm text-red-700">
          <strong>Documentos reprovados.</strong>{" "}
          {status.docRejectReason ?? "Reenvie seus documentos em Configurações."}
          {" "}
          <a href="/dashboard/settings" className="underline font-medium">
            Ir para Configurações
          </a>
        </p>
      </div>
    );
  }

  if (status?.docStatus === "pending") {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-3">
        <Clock className="h-4 w-4 text-amber-500 shrink-0" />
        <p className="text-sm text-amber-700">
          <strong>Conta em análise.</strong> Seus documentos estão sendo verificados pelo administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center gap-3">
      <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0" />
      <p className="text-sm text-blue-700">
        <strong>Conta inativa.</strong> Envie seus documentos para ativar sua conta.{" "}
        <a href="/dashboard/settings" className="underline font-medium">
          Ir para Configurações
        </a>
      </p>
    </div>
  );
}
