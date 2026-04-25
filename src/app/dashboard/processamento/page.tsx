import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProcessingList } from "@/components/shared/processing-list";

export const dynamic = "force-dynamic";

export default async function DashboardProcessamentoPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const role = session.user.role;
  if (role !== "creator" && role !== "manager") {
    // Owner/admin têm a versão completa em /admin/processamento.
    redirect("/dashboard");
  }
  return (
    <ProcessingList
      title="Em processamento"
      description={
        role === "manager"
          ? "Conteúdos dos creators que você gerencia"
          : "Seus conteúdos sendo gerados ou comprimidos"
      }
      showCreator={role === "manager"}
    />
  );
}
