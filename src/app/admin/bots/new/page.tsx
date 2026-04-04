"use client";

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SimpleUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function AdminNewBotPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

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

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/admin/users?pageSize=100");
        const data = await res.json();
        if (data.success && data.data?.users) {
          setUsers(data.data.users);
        }
      } catch {
        toast.error("Erro ao carregar usuários");
      }
    }
    loadUsers();
  }, []);

  async function onSubmit(data: CreateBotInput) {
    if (!selectedUserId) {
      toast.error("Selecione o proprietário do bot");
      return;
    }
    setIsLoading(true);
    try {
      const result = await createBot({ ...data, userId: selectedUserId });

      if (!result.success) {
        toast.error(result.error ?? "Erro ao criar bot");
        return;
      }

      toast.success("Bot criado com sucesso!");
      router.push(`/admin/bots/${result.data!.id}`);
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
          className="text-slate-500 hover:text-slate-900 hover:bg-slate-50"
        >
          <Link href="/admin/bots">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Novo Bot</h1>
        <p className="text-sm text-slate-400">
          Crie um bot e atribua a um usuário da plataforma
        </p>
      </div>

      <Card className="bg-white border-slate-200/60 rounded-xl text-slate-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
              <Bot className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <CardTitle className="text-base text-slate-900">Configurações do Bot</CardTitle>
              <CardDescription className="text-slate-400">
                Você precisa de um token do{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
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
              <Label htmlFor="userId" className="text-slate-700">
                Proprietário do Bot <span className="text-red-600">*</span>
              </Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="border-slate-200 bg-white text-slate-900">
                  <SelectValue placeholder="Selecione o usuário..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email}) — {user.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">
                Selecione o usuário que será o dono deste bot
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-700">
                Nome do Bot <span className="text-red-600">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Ex: Meu Canal Premium"
                disabled={isLoading}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name.message}</p>
              )}
              <p className="text-xs text-slate-400">
                Nome de exibição no painel (não é o username do bot)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegramToken" className="text-slate-700">
                Token do BotFather <span className="text-red-600">*</span>
              </Label>
              <Input
                id="telegramToken"
                type="text"
                placeholder="1234567890:AAF..."
                disabled={isLoading}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400 font-mono text-sm"
                {...register("telegramToken")}
              />
              {errors.telegramToken && (
                <p className="text-xs text-red-600">
                  {errors.telegramToken.message}
                </p>
              )}
              <p className="text-xs text-slate-400">
                Obtenha em @BotFather com o comando /newbot ou /token
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-slate-700">
                Descrição
              </Label>
              <Textarea
                id="description"
                placeholder="Descreva o conteúdo que o bot oferece..."
                rows={3}
                disabled={isLoading}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400 resize-none"
                {...register("description")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="welcomeMessage" className="text-slate-700">
                Mensagem de Boas-vindas
              </Label>
              <Textarea
                id="welcomeMessage"
                placeholder="Mensagem enviada quando o usuário iniciar o bot..."
                rows={4}
                disabled={isLoading}
                className="border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-primary-400 resize-none"
                {...register("welcomeMessage")}
              />
              <p className="text-xs text-slate-400">
                Suporta formatação Markdown do Telegram (*negrito*, _itálico_)
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={() => router.back()}
                className="border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
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
