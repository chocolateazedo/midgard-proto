import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CampaignComposer } from "../composer";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "owner" && session.user.role !== "admin")
  ) {
    redirect("/login");
  }
  return <CampaignComposer />;
}
