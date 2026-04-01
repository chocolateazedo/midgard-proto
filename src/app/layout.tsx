import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "sonner"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "BotFlow",
  description: "Plataforma de monetização via Telegram",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} font-sans antialiased`}>
        <SessionProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "bg-white border border-slate-200 text-slate-900 shadow-lg",
                description: "text-slate-500",
                actionButton: "bg-primary-600 text-white",
                cancelButton: "bg-slate-100 text-slate-700",
                error: "!bg-red-50 !border-red-200 !text-red-700",
                success: "!bg-emerald-50 !border-emerald-200 !text-emerald-700",
              },
            }}
          />
        </SessionProvider>
      </body>
    </html>
  )
}
