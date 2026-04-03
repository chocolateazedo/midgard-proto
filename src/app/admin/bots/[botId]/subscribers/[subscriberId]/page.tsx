import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { getBotById, getBotSubscriberDetail } from "@/server/queries/bots";
import { SubscriberDetailView } from "@/components/shared/subscriber-detail";

interface AdminSubscriberDetailPageProps {
  params: Promise<{ botId: string; subscriberId: string }>;
}

export default async function AdminSubscriberDetailPage({ params }: AdminSubscriberDetailPageProps) {
  const { botId, subscriberId } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (session.user.role !== "owner" && session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const bot = await getBotById(botId);
  if (!bot) notFound();

  const subscriber = await getBotSubscriberDetail(botId, subscriberId);
  if (!subscriber) notFound();

  return (
    <SubscriberDetailView
      subscriber={subscriber}
      backHref={`/admin/bots/${botId}/subscribers`}
    />
  );
}
