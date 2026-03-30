import * as React from "react"
import { Zap } from "lucide-react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-900/50">
          <Zap className="h-6 w-6 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            BotFlow
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Plataforma de monetização via Telegram
          </p>
        </div>
      </div>

      {/* Card wrapper */}
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50 p-6">
        {children}
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-zinc-600">
        &copy; {new Date().getFullYear()} BotFlow. Todos os direitos reservados.
      </p>
    </div>
  )
}
