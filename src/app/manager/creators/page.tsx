import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getManagerCreators } from "@/server/queries/managers";
import { ManagerCreatorsClient } from "./creators-client";

export default async function ManagerCreatorsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") {
    redirect("/login");
  }

  const creators = await getManagerCreators(session.user.id);
  return (
    <ManagerCreatorsClient
      creators={creators.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
