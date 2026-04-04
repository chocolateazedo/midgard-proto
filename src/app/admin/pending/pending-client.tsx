"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { approveUserDocuments, rejectUserDocuments } from "@/server/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ClipboardCheck,
  CheckCircle,
  XCircle,
  Loader2,
  FileImage,
  Mail,
  User,
} from "lucide-react";

type PendingRequest = {
  id: string;
  name: string;
  email: string;
  docType: string | null;
  docFrontKey: string | null;
  docBackKey: string | null;
  docSelfieKey: string | null;
  createdAt: Date;
};

interface PendingRequestsClientProps {
  requests: PendingRequest[];
}

const docTypeLabels: Record<string, string> = {
  rg: "RG",
  rne: "RNE",
  cpf: "CPF",
};

export function PendingRequestsClient({ requests }: PendingRequestsClientProps) {
  const router = useRouter();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<PendingRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [viewingDocs, setViewingDocs] = useState<PendingRequest | null>(null);

  async function handleApprove(userId: string) {
    setApprovingId(userId);
    try {
      const result = await approveUserDocuments(userId);
      if (result.success) {
        toast.success("Documentos aprovados! Usuário ativado.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Erro ao aprovar");
      }
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject() {
    if (!rejectDialog) return;
    setRejecting(true);
    try {
      const result = await rejectUserDocuments(rejectDialog.id, rejectReason);
      if (result.success) {
        toast.success("Documentos rejeitados. O usuário será notificado.");
        setRejectDialog(null);
        setRejectReason("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Erro ao rejeitar");
      }
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pendentes</h1>
        <p className="text-sm text-slate-400">
          Requisições de ativação aguardando aprovação de documentos
        </p>
      </div>

      <Card className="bg-white border-slate-200/60 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary-600" />
            Aguardando Aprovação ({requests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardCheck className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">
                Nenhuma requisição pendente
              </p>
              <p className="text-slate-400 text-sm mt-1">
                Quando creators enviarem documentos, aparecerão aqui
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-4 rounded-lg border border-slate-200/60 p-4"
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 shrink-0">
                    <User className="h-5 w-5 text-amber-600" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{req.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Mail className="h-3 w-3 text-slate-400" />
                      <span className="text-xs text-slate-400">{req.email}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
                        {req.docType ? docTypeLabels[req.docType] ?? req.docType : "—"}
                      </Badge>
                      <span className="text-xs text-slate-300">
                        Cadastro: {formatDate(new Date(req.createdAt))}
                      </span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingDocs(req)}
                      className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
                    >
                      <FileImage className="mr-1 h-3.5 w-3.5" />
                      Ver Docs
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(req.id)}
                      disabled={approvingId === req.id}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      {approvingId === req.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="mr-1 h-3.5 w-3.5" />
                          Aprovar
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setRejectDialog(req); setRejectReason(""); }}
                      className="border-red-200 text-red-600 hover:bg-red-50 text-xs"
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      Rejeitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Documents Dialog */}
      <Dialog open={!!viewingDocs} onOpenChange={(open) => { if (!open) setViewingDocs(null); }}>
        <DialogContent className="border-slate-200/60 bg-white text-slate-900 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Documentos — {viewingDocs?.name}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Tipo: {viewingDocs?.docType ? docTypeLabels[viewingDocs.docType] ?? viewingDocs.docType : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Frente", key: viewingDocs?.docFrontKey },
              { label: "Verso", key: viewingDocs?.docBackKey },
              { label: "Selfie", key: viewingDocs?.docSelfieKey },
            ].map((doc) => (
              <div key={doc.label} className="space-y-2">
                <p className="text-sm font-medium text-slate-700">{doc.label}</p>
                {doc.key ? (
                  <img
                    src={`/api/user-doc/${viewingDocs?.id}/${doc.label.toLowerCase()}`}
                    alt={doc.label}
                    className="w-full rounded-lg border border-slate-200 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-400">Não enviado</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(open) => { if (!open && !rejecting) setRejectDialog(null); }}>
        <DialogContent className="border-slate-200/60 bg-white text-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar Documentos</DialogTitle>
            <DialogDescription className="text-slate-400">
              Informe o motivo da rejeição para {rejectDialog?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex: Documento ilegível, foto cortada..."
              className="border-slate-200 bg-white text-slate-900 placeholder-slate-400"
            />
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setRejectDialog(null)}
              disabled={rejecting}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReject}
              disabled={rejecting}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {rejecting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rejeitando...</>
              ) : (
                "Confirmar Rejeição"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
