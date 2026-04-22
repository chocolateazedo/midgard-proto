import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { hasBotSettingsPermission } from "@/lib/bot-permissions";
import { getBotById } from "@/server/queries/bots";

interface SettingsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ botId: string }>;
}

export default async function BotSettingsLayout({
  children,
  params,
}: SettingsLayoutProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const bot = await getBotById(botId);
  if (!bot) notFound();

  if (!hasBotSettingsPermission(bot, session)) {
    // Creator dono do bot — sem acesso a configurações. Manda pra home do bot.
    redirect(`/dashboard/bots/${botId}`);
  }

  return <>{children}</>;
}
