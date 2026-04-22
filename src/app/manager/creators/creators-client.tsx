"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Loader2, Crown, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { createCreatorWithBot } from "@/server/actions/manager.actions";

type CreatorRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
  managerFeePercent: number | null;
  createdAt: string;
  activeBotCount: number;
  totalBotCount: number;
  managerEarnings: string;
  creatorNet: string;
};

export function ManagerCreatorsClient({ creators }: { creators: CreatorRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fee, setFee] = React.useState("20");
  const [botName, setBotName] = React.useState("");
  const [botToken, setBotToken] = React.useState("");
  const [botDescription, setBotDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createCreatorWithBot({
        name,
        email,
        password,
        managerFeePercent: parseFloat(fee) || 0,
        botName,
        botToken,
        botDescription: botDescription || undefined,
      });
      if (res.success) {
        toast.success("Creator + bot criados");
        setOpen(false);
        setName("");
        setEmail("");
        setPassword("");
        setBotName("");
        setBotToken("");
        setBotDescription("");
        setFee("20");
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao criar creator");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Creators</h1>
          <p className="text-sm text-slate-500 mt-1">
            {creators.length} creator(s) sob sua gestão
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary-600 hover:bg-primary-700 text-white">
              <UserPlus className="mr-2 h-4 w-4" />
              Novo Creator
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-slate-200/60 text-slate-900 max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Creator + Bot</DialogTitle>
              <DialogDescription className="text-slate-500">
                O creator recebe acesso ao dashboard e o primeiro bot já conectado.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Nome</Label>
                <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-pass">Senha inicial</Label>
                <Input id="c-pass" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-fee">Sua taxa sobre o bruto (%)</Label>
                <Input
                  id="c-fee"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
                <p className="text-xs text-slate-400">
                  Taxa do gestor aplicada sobre cada transação deste creator.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <p className="text-sm font-medium text-slate-700">Primeiro bot</p>
                <div className="space-y-1.5">
                  <Label htmlFor="b-name">Nome do bot</Label>
                  <Input id="b-name" value={botName} onChange={(e) => setBotName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-token">Token BotFather</Label>
                  <Input
                    id="b-token"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    required
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-desc">Descrição (opcional)</Label>
                  <Input
                    id="b-desc"
                    value={botDescription}
                    onChange={(e) => setBotDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="bg-primary-600 hover:bg-primary-700 text-white">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Creator"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-white border-slate-200/60">
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sua taxa</TableHead>
                <TableHead>Bots</TableHead>
                <TableHead>Líquido do creator</TableHead>
                <TableHead>Sua receita</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="text-right pr-6">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creators.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                    Nenhum creator ainda. Crie o primeiro acima.
                  </TableCell>
                </TableRow>
              )}
              {creators.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-6">
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        c.isActive
                          ? "bg-emerald-100 text-emerald-600 text-xs"
                          : "bg-slate-100 text-slate-500 text-xs"
                      }
                    >
                      {c.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {c.managerFeePercent?.toFixed(1) ?? "—"}%
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {c.activeBotCount}/{c.totalBotCount}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-emerald-600">
                    {formatCurrency(parseFloat(c.creatorNet))}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-amber-700">
                    <Crown className="inline h-3.5 w-3.5 mr-1" />
                    {formatCurrency(parseFloat(c.managerEarnings))}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {formatDate(new Date(c.createdAt))}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/manager/creators/${c.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
