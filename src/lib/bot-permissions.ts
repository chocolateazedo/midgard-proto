/**
 * Permissão unificada pra gerenciar um bot. Inclui a role "manager"
 * que tem acesso aos bots dos creators que ela gere.
 *
 * Uso típico nos action handlers após buscar o bot. Esperar o bot ter
 * `user.managedByUserId` no payload quando a role da session é "manager" —
 * sem isso, manager é sempre negado.
 */
export function hasBotManagePermission(
  bot: {
    userId: string;
    user?: { managedByUserId?: string | null } | null;
  },
  session: { user: { id: string; role: string } } | null | undefined
): boolean {
  if (!session?.user?.id) return false;
  const { id: userId, role } = session.user;
  if (role === "owner" || role === "admin") return true;
  if (bot.userId === userId) return true;
  if (role === "manager" && bot.user?.managedByUserId === userId) return true;
  return false;
}

/**
 * Permissão para ajustes de configuração do bot (token, webhook, planos,
 * canal, boas-vindas, catálogo, geral). Mais restrita que manage: creator
 * é excluído mesmo sendo dono. Só staff (owner/admin) ou manager do
 * creator dono acessam.
 */
export function hasBotSettingsPermission(
  bot: {
    userId: string;
    user?: { managedByUserId?: string | null } | null;
  },
  session: { user: { id: string; role: string } } | null | undefined
): boolean {
  if (!session?.user?.id) return false;
  const { id: userId, role } = session.user;
  if (role === "owner" || role === "admin") return true;
  if (role === "manager" && bot.user?.managedByUserId === userId) return true;
  return false;
}
