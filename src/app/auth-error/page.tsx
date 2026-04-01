"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AlertCircle, Zap } from "lucide-react";
import Link from "next/link";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, string> = {
    Configuration: "Erro de configuracao do NextAuth. Verifique AUTH_SECRET, AUTH_URL e as variaveis de ambiente.",
    CredentialsSignin: "Email ou senha invalidos.",
    OAuthSignin: "Erro ao iniciar o fluxo OAuth.",
    OAuthCallback: "Erro no callback OAuth.",
    SessionRequired: "Sessao necessaria para acessar esta pagina.",
    AccessDenied: "Acesso negado.",
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto mb-4">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">BotFlow</h1>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle size={20} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Erro de Autenticacao</h2>
              <p className="text-sm text-slate-500">Algo deu errado</p>
            </div>
          </div>

          <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
            <p className="text-sm font-mono text-red-700">{error || "Desconhecido"}</p>
          </div>

          <p className="text-sm text-slate-600 mb-4">
            {errorMessages[error || ""] || "Erro desconhecido durante a autenticacao."}
          </p>

          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-2">Variaveis necessarias:</p>
            <ul className="text-xs text-slate-500 space-y-1 font-mono">
              <li>AUTH_SECRET / NEXTAUTH_SECRET</li>
              <li>AUTH_URL / NEXTAUTH_URL</li>
              <li>DATABASE_URL</li>
            </ul>
          </div>

          <Link
            href="/login"
            className="mt-4 block w-full text-center px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
          >
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <ErrorContent />
    </Suspense>
  );
}
