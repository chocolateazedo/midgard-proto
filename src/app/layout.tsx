import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/shared/theme-provider"
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
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <SessionProvider>
          <ThemeProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                classNames: {
                  toast:
                    "bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-lg",
                  description: "text-zinc-400",
                  actionButton: "bg-violet-600 text-white",
                  cancelButton: "bg-zinc-800 text-zinc-300",
                  error: "!bg-red-950 !border-red-900 !text-red-100",
                  success: "!bg-emerald-950 !border-emerald-900 !text-emerald-100",
                },
              }}
            />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
