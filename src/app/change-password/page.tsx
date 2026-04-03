"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Zap, KeyRound } from "lucide-react";

import { changePassword } from "@/server/actions/auth.actions";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não conferem");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Nova senha deve ter pelo menos 6 caracteres");
      return;
    }

    setIsLoading(true);
    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
      });

      if (!result.success) {
        toast.error(result.error ?? "Erro ao alterar senha");
        return;
      }

      // Re-authenticate to get a fresh JWT with mustChangePassword=false from DB
      const signInResult = await signIn("credentials", {
        email: session?.user?.email,
        password: newPassword,
        redirect: false,
      });

      if (signInResult?.error) {
        toast.error("Senha alterada, mas houve erro ao reautenticar. Faça login novamente.");
        window.location.href = "/login";
        return;
      }

      toast.success("Senha alterada com sucesso! Redirecionando...");
      window.location.href = "/";
    } catch {
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto mb-4">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">BotFlow</h1>
          <p className="text-slate-500 text-sm mt-1">Plataforma de monetizacao via Telegram</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-slate-900">Alterar Senha</h2>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            Voce precisa definir uma nova senha antes de continuar.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Senha atual
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Senha fornecida pelo admin"
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Nova senha
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Confirmar nova senha
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 shadow-sm"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Alterando...
                </span>
              ) : (
                "Alterar Senha"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
