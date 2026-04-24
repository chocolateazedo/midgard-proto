import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { FinancialClient } from "./financial-client";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const role = session.user.role;
  if (role !== "creator" && role !== "manager") {
    // Outras roles não têm subconta de repasse.
    redirect("/dashboard");
  }
  return <FinancialClient />;
}
