import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPendingDocumentRequests } from "@/server/actions/admin.actions";
import { PendingRequestsClient } from "./pending-client";

export default async function AdminPendingPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "owner" && session.user.role !== "admin")) {
    redirect("/login");
  }

  const result = await getPendingDocumentRequests();
  const pending = result.success ? result.data ?? [] : [];

  return <PendingRequestsClient requests={pending} />;
}
