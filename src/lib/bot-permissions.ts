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
 * canal, boas-vindas, catálogo, geral). Reservado a staff (owner/admin).
 * Creator (dono do bot) e manager estão fora — manager gerencia apenas
 * conteúdo via publish/content.
 */
export function hasBotSettingsPermission(
  _bot: {
    userId: string;
    user?: { managedByUserId?: string | null } | null;
  },
  session: { user: { id: string; role: string } } | null | undefined
): boolean {
  if (!session?.user?.id) return false;
  const { role } = session.user;
  return role === "owner" || role === "admin";
}
