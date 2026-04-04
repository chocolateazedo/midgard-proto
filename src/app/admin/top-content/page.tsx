import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTopContent } from "@/server/queries/earnings";
import { TopContentClient } from "./top-content-client";

interface TopContentPageProps {
  searchParams: Promise<{ period?: string; free?: string }>;
}

export default async function AdminTopContentPage({ searchParams }: TopContentPageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "owner" && session.user.role !== "admin")) {
    redirect("/login");
  }

  const params = await searchParams;
  const period = params.period ?? "monthly";
  const includeFree = params.free === "true";

  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "daily":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "weekly":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const topContent = await getTopContent(startDate, now, includeFree, 50);

  return (
    <TopContentClient
      content={topContent}
      currentPeriod={period}
      currentIncludeFree={includeFree}
    />
  );
}
