import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAllPlatformSubscribers } from "@/server/queries/bots";
import { PlatformSubscribersClient } from "../subscribers/subscribers-client";

interface AssinantesPageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function AdminAssinantesPage({ searchParams }: AssinantesPageProps) {
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
    search || undefined,
    { withActiveSubscription: true }
  );

  return (
    <PlatformSubscribersClient
      subscribers={subscribers}
      total={total}
      page={page}
      totalPages={totalPages}
      currentSearch={search}
      title="Assinantes"
      subtitle="Membros com plano ativo hoje"
      emptyTitle="Nenhum assinante ativo"
      emptySubtitle="Quando alguém pagar uma assinatura, aparecerá aqui"
      basePath="/admin/assinantes"
    />
  );
}
