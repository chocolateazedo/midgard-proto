"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { GeneralTab } from "@/app/dashboard/bots/[botId]/settings/components/general-tab";
import { WelcomeTab } from "@/app/dashboard/bots/[botId]/settings/components/welcome-tab";
import { PlansTab } from "@/app/dashboard/bots/[botId]/settings/components/plans-tab";
import { CatalogTab } from "@/app/dashboard/bots/[botId]/settings/components/catalog-tab";
import { LiveTab } from "@/app/dashboard/bots/[botId]/settings/components/live-tab";

export default function AdminBotSettingsPage() {
  const params = useParams();
  const botId = params.botId as string;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-slate-500 hover:text-slate-900 hover:bg-slate-50"
        >
          <Link href={`/admin/bots/${botId}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações do Bot</h1>
        <p className="text-sm text-slate-400">
          Gerencie todos os aspectos do bot
        </p>
      </div>

      <Tabs defaultValue="welcome" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-slate-100">
          <TabsTrigger value="welcome" className="text-xs sm:text-sm">
            Boas-Vindas
          </TabsTrigger>
          <TabsTrigger value="plans" className="text-xs sm:text-sm">
            Planos
          </TabsTrigger>
          <TabsTrigger value="catalog" className="text-xs sm:text-sm">
            Catálogo
          </TabsTrigger>
          <TabsTrigger value="live" className="text-xs sm:text-sm">
            Live
          </TabsTrigger>
          <TabsTrigger value="general" className="text-xs sm:text-sm">
            Geral
          </TabsTrigger>
        </TabsList>

        <TabsContent value="welcome" className="mt-6">
          <WelcomeTab botId={botId} />
        </TabsContent>

        <TabsContent value="plans" className="mt-6">
          <PlansTab botId={botId} />
        </TabsContent>

        <TabsContent value="catalog" className="mt-6">
          <CatalogTab botId={botId} basePath="/admin/bots" />
        </TabsContent>

        <TabsContent value="live" className="mt-6">
          <LiveTab botId={botId} />
        </TabsContent>

        <TabsContent value="general" className="mt-6">
          <GeneralTab botId={botId} basePath="/admin/bots" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
