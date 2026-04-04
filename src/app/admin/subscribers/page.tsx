import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAllPlatformSubscribers } from "@/server/queries/bots";
import { PlatformSubscribersClient } from "./subscribers-client";

interface SubscribersPageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function AdminSubscribersPage({ searchParams }: SubscribersPageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "owner" && session.user.role !== "admin")) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const search = params.search ?? "";

  const { subscribers, total, totalPages } = await getAllPlatformSubscribers(
    page,
    20,
    search || undefined
  );

  return (
    <PlatformSubscribersClient
      subscribers={subscribers}
      total={total}
      page={page}
      totalPages={totalPages}
      currentSearch={search}
    />
  );
}
