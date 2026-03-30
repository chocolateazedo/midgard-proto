import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getAllUsers } from "@/server/queries/users"
import { UsersClientPage } from "./users-client"

interface UsersPageProps {
  searchParams: Promise<{
    page?: string
    search?: string
    role?: string
    status?: string
  }>
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const session = await auth()
  if (!session?.user || (session.user.role !== "owner" && session.user.role !== "admin")) {
    redirect("/login")
  }

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? "1", 10))
  const search = params.search ?? ""
  const role = params.role && params.role !== "all" ? params.role : undefined
  const statusParam = params.status
  const isActive =
    statusParam === "active" ? true : statusParam === "inactive" ? false : undefined

  const { users, total, totalPages } = await getAllUsers(page, 20, {
    search: search || undefined,
    role,
    isActive,
  })

  return (
    <UsersClientPage
      users={users}
      total={total}
      page={page}
      totalPages={totalPages}
      currentSearch={search}
      currentRole={params.role ?? "all"}
      currentStatus={params.status ?? "all"}
      currentUserRole={session.user.role}
    />
  )
}
