import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CampaignDetailClient } from "./detail-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "owner" && session.user.role !== "admin")
  ) {
    redirect("/login");
  }
  return <CampaignDetailClient campaignId={id} />;
}
