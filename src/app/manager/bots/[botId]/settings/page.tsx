import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { ensureManagerOwnsBot } from "@/server/queries/managers";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralTab } from "@/app/dashboard/bots/[botId]/settings/components/general-tab";
import { WelcomeTab } from "@/app/dashboard/bots/[botId]/settings/components/welcome-tab";
import { PlansTab } from "@/app/dashboard/bots/[botId]/settings/components/plans-tab";
import { CatalogTab } from "@/app/dashboard/bots/[botId]/settings/components/catalog-tab";
import { ChannelTab } from "@/app/dashboard/bots/[botId]/settings/components/channel-tab";

interface PageProps {
  params: Promise<{ botId: string }>;
}

export default async function ManagerBotSettingsPage({ params }: PageProps) {
  const { botId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "manager") redirect("/login");

  const owns = await ensureManagerOwnsBot(session.user.id, botId);
  if (!owns) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="text-slate-500">
        <Link href={`/manager/bots/${botId}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Voltar
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações do Bot</h1>
      </div>

      <Tabs defaultValue="welcome" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-slate-100">
          <TabsTrigger value="welcome">Boas-Vindas</TabsTrigger>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="catalog">Catálogo</TabsTrigger>
          <TabsTrigger value="channel">Canal</TabsTrigger>
          <TabsTrigger value="general">Geral</TabsTrigger>
        </TabsList>
        <TabsContent value="welcome" className="mt-6">
          <WelcomeTab botId={botId} />
        </TabsContent>
        <TabsContent value="plans" className="mt-6">
          <PlansTab botId={botId} />
        </TabsContent>
        <TabsContent value="catalog" className="mt-6">
          <CatalogTab botId={botId} basePath="/manager/bots" />
        </TabsContent>
        <TabsContent value="channel" className="mt-6">
          <ChannelTab botId={botId} />
        </TabsContent>
        <TabsContent value="general" className="mt-6">
          <GeneralTab botId={botId} basePath="/manager/bots" userRole={session.user.role} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
