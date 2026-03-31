"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-lg rounded-lg border border-red-800 bg-zinc-900 p-8">
        <h1 className="text-2xl font-bold text-red-400 mb-4">Erro de Autenticacao</h1>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-zinc-400">Codigo do erro:</p>
            <p className="text-lg text-zinc-100 font-mono bg-zinc-800 p-2 rounded mt-1">
              {error || "Desconhecido"}
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-400">Descricao:</p>
            <p className="text-zinc-300 text-sm mt-1">
              {error === "Configuration" && "Erro de configuracao do NextAuth. Verifique AUTH_SECRET, AUTH_URL e as variaveis de ambiente."}
              {error === "CredentialsSignin" && "Email ou senha invalidos."}
              {error === "OAuthSignin" && "Erro ao iniciar o fluxo OAuth."}
              {error === "OAuthCallback" && "Erro no callback OAuth."}
              {error === "SessionRequired" && "Sessao necessaria para acessar esta pagina."}
              {error === "AccessDenied" && "Acesso negado."}
              {!error && "Erro desconhecido durante a autenticacao."}
            </p>
          </div>
          <div className="pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 mb-2">Variaveis necessarias no servidor:</p>
            <ul className="text-xs text-zinc-400 space-y-1 font-mono">
              <li>AUTH_SECRET / NEXTAUTH_SECRET</li>
              <li>AUTH_URL / NEXTAUTH_URL</li>
              <li>DATABASE_URL</li>
            </ul>
          </div>
          <a href="/login" className="inline-block mt-4 text-violet-400 hover:underline text-sm">
            Voltar para o login
          </a>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">Carregando...</div>}>
      <ErrorContent />
    </Suspense>
  );
}
