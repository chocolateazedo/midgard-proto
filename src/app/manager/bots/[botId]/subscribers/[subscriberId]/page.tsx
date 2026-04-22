import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { getBotSubscriberDetail } from "@/server/queries/bots";
import { ensureManagerOwnsBot } from "@/server/queries/managers";
import { SubscriberDetailView } from "@/components/shared/subscriber-detail";

interface PageProps {
  params: Promise<{ botId: string; subscriberId: string }>;
}

export default async function ManagerSubscriberDetailPage({ params }: PageProps) {
  const { botId, subscriberId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const owns = await ensureManagerOwnsBot(session.user.id, botId);
  if (!owns) notFound();

  const subscriber = await getBotSubscriberDetail(botId, subscriberId);
  if (!subscriber) notFound();

  return (
    <SubscriberDetailView
      subscriber={subscriber}
      backHref={`/manager/bots/${botId}/subscribers`}
    />
  );
}
