"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Bot } from "lucide-react";

import { createBotSchema, type CreateBotInput } from "@/lib/validations";
import { createBot } from "@/server/actions/bot.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewBotPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateBotInput>({
    resolver: zodResolver(createBotSchema),
    defaultValues: {
      welcomeMessage:
        "Olá! Bem-vindo(a)! Use /catalog para ver os conteúdos disponíveis.",
    },
  });

  async function onSubmit(data: CreateBotInput) {
    setIsLoading(true);
    try {
      const result = await createBot(data);

      if (!result.success) {
        toast.error(result.error ?? "Erro ao criar bot");
        return;
      }

      toast.success("Bot criado com sucesso!");
      router.push(`/dashboard/bots/${result.data!.id}`);
    } catch {
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <Link href="/dashboard/bots">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Novo Bot</h1>
        <p className="text-sm text-zinc-500">
          Configure seu bot do Telegram para começar a vender conteúdo
        </p>
      </div>

      <Card className="border-zinc-800 bg-zinc-900 text-zinc-100">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20">
              <Bot className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-base">Configurações do Bot</CardTitle>
              <CardDescription className="text-zinc-500">
                Você precisa de um token do{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:underline"
                >
                  @BotFather
                </a>{" "}
                para continuar
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-zinc-300">
                Nome do Bot <span className="text-red-400">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Ex: Meu Canal Premium"
                disabled={isLoading}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-red-400">{errors.name.message}</p>
              )}
              <p className="text-xs text-zinc-500">
                Nome de exibição no painel (não é o username do bot)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegramToken" className="text-zinc-300">
                Token do BotFather <span className="text-red-400">*</span>
              </Label>
              <Input
                id="telegramToken"
                type="text"
                placeholder="1234567890:AAF..."
                disabled={isLoading}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500 font-mono text-sm"
                {...register("telegramToken")}
              />
              {errors.telegramToken && (
                <p className="text-xs text-red-400">
                  {errors.telegramToken.message}
                </p>
              )}
              <p className="text-xs text-zinc-500">
                Obtenha em @BotFather com o comando /newbot ou /token
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-zinc-300">
                Descrição
              </Label>
              <Textarea
                id="description"
                placeholder="Descreva o conteúdo que seu bot oferece..."
                rows={3}
                disabled={isLoading}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500 resize-none"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-red-400">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="welcomeMessage" className="text-zinc-300">
                Mensagem de Boas-vindas
              </Label>
              <Textarea
                id="welcomeMessage"
                placeholder="Mensagem enviada quando o usuário iniciar o bot..."
                rows={4}
                disabled={isLoading}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500 resize-none"
                {...register("welcomeMessage")}
              />
              {errors.welcomeMessage && (
                <p className="text-xs text-red-400">
                  {errors.welcomeMessage.message}
                </p>
              )}
              <p className="text-xs text-zinc-500">
                Suporta formatação Markdown do Telegram (*negrito*, _itálico_)
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={() => router.back()}
                className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando bot...
                  </>
                ) : (
                  "Criar Bot"
                )}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
