import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { getBotById } from "@/server/queries/bots";
import { PublishForm } from "./publish-form";

interface PublishPageProps {
  params: Promise<{ botId: string }>;
}

export default async function PublishPage({ params }: PublishPageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const bot = await getBotById(botId);
  if (!bot) notFound();

  const isOwner =
    bot.userId === session.user.id ||
    session.user.role === "owner" ||
    session.user.role === "admin";
  if (!isOwner) redirect("/dashboard/bots");

  return (
    <div className="mx-auto max-w-xl py-2">
      <PublishForm botId={botId} />
    </div>
  );
}
