import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MarketingClient } from "./marketing-client";

export const dynamic = "force-dynamic";

export default async function AdminMarketingPage() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "owner" && session.user.role !== "admin")
  ) {
    redirect("/login");
  }
  return <MarketingClient />;
}
