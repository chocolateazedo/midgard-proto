import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const report = await db.qaReport.findUnique({
    where: { publicToken: token },
    include: {
      criadoPor: { select: { name: true } },
      items: {
        include: { task: { select: { nome: true, descricao: true } } },
        orderBy: { task: { ordem: "asc" } },
      },
    },
  })

  if (!report) {
    return NextResponse.json(
      { error: "Relatório não encontrado" },
      { status: 404 }
    )
  }

  return NextResponse.json({
    id: report.id,
    titulo: report.titulo,
    status: report.status,
    criadoPor: report.criadoPor.name,
    createdAt: report.createdAt.toISOString(),
    finalizadoEm: report.finalizadoEm?.toISOString() ?? null,
    items: report.items.map((item) => ({
      id: item.id,
      taskNome: item.task.nome,
      taskDescricao: item.task.descricao,
      marcado: item.marcado,
      anotacoes: item.anotacoes,
    })),
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await req.json()
  const { itemId, marcado, anotacoes } = body

  if (!itemId) {
    return NextResponse.json({ error: "itemId é obrigatório" }, { status: 400 })
  }

  const report = await db.qaReport.findUnique({
    where: { publicToken: token },
    select: { id: true, status: true },
  })

  if (!report) {
    return NextResponse.json(
      { error: "Relatório não encontrado" },
      { status: 404 }
    )
  }

  if (report.status === "FINALIZADO") {
    return NextResponse.json(
      { error: "Relatório finalizado. Não é possível editar." },
      { status: 403 }
    )
  }

  const updateData: Record<string, any> = {}
  if (marcado !== undefined) updateData.marcado = marcado
  if (anotacoes !== undefined) updateData.anotacoes = anotacoes

  await db.qaReportItem.update({
    where: { id: itemId },
    data: updateData,
  })

  return NextResponse.json({ success: true })
}
