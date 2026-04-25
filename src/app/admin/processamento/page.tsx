import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProcessingList } from "@/components/shared/processing-list";

export const dynamic = "force-dynamic";

export default async function AdminProcessamentoPage() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "owner" && session.user.role !== "admin")
  ) {
    redirect("/login");
  }
  return (
    <ProcessingList
      title="Em processamento"
      description="Conteúdos sendo gerados ou comprimidos em toda a plataforma"
      showCreator
    />
  );
}
