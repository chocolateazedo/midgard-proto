/**
 * Helpers compartilhados de assinaturas.
 * Centralizar aqui a formatação de duração evita replicar o switch por
 * todas as UIs / bot flows / workers. Se um dia precisar mudar os labels,
 * troca num lugar só.
 */

/**
 * Converte dias de duração em um label humano.
 * Mantém nomes tradicionais (Mensal/Trimestral/Semestral/Anual) para as
 * durações padrão, e usa "N dias" para as personalizadas (7, 15, 45, etc).
 */
export function formatDuration(days: number): string {
  switch (days) {
    case 7:
      return "Semanal";
    case 15:
      return "Quinzenal";
    case 30:
      return "Mensal";
    case 90:
      return "Trimestral";
    case 180:
      return "Semestral";
    case 365:
      return "Anual";
    default:
      if (days === 1) return "1 dia";
      return `${days} dias`;
  }
}

/**
 * Presets comuns usados na UI de criação/edição de plano. O usuário pode
 * escolher um preset ou "custom" para digitar qualquer valor entre 1 e 400.
 */
export const DURATION_PRESETS: ReadonlyArray<{
  days: number;
  label: string;
  hint: string;
}> = [
  { days: 7, label: "Semanal", hint: "7 dias" },
  { days: 15, label: "Quinzenal", hint: "15 dias" },
  { days: 30, label: "Mensal", hint: "30 dias" },
  { days: 45, label: "45 dias", hint: "" },
  { days: 90, label: "Trimestral", hint: "90 dias" },
  { days: 180, label: "Semestral", hint: "180 dias" },
  { days: 365, label: "Anual", hint: "365 dias" },
];
