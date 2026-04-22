import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { ensureManagerOwnsBot } from "@/server/queries/managers";
import { PublishForm } from "@/app/dashboard/bots/[botId]/publish/publish-form";

interface PageProps {
  params: Promise<{ botId: string }>;
}

export default async function ManagerPublishPage({ params }: PageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const owns = await ensureManagerOwnsBot(session.user.id, botId);
  if (!owns) notFound();

  return (
    <div className="mx-auto max-w-xl py-2">
      <PublishForm botId={botId} basePath="/manager/bots" />
    </div>
  );
}
