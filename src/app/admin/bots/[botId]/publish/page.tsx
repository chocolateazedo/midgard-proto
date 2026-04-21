import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { getBotById } from "@/server/queries/bots";
import { PublishForm } from "@/app/dashboard/bots/[botId]/publish/publish-form";

interface PublishPageProps {
  params: Promise<{ botId: string }>;
}

export default async function AdminPublishPage({ params }: PublishPageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (session.user.role !== "owner" && session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const bot = await getBotById(botId);
  if (!bot) notFound();

  return (
    <div className="mx-auto max-w-xl py-2">
      <PublishForm botId={botId} basePath="/admin/bots" />
    </div>
  );
}
