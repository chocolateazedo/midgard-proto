// Helpers de formatação para dados de pagamento.
// Armazenamos sempre o valor normalizado (só dígitos no CPF, E.164 no telefone);
// estas funções convertem para exibição amigável ao usuário.

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

export function formatCpfForDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D+/g, "");
  if (d.length !== 11) return raw;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function formatPhoneForDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  // Entrada esperada: +55DDNNNNNNNNN ou só dígitos.
  const digits = raw.replace(/\D+/g, "");
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length !== 10 && local.length !== 11) return raw;
  const ddd = local.slice(0, 2);
  const body = local.slice(2);
  if (body.length === 9) {
    return `(${ddd}) ${body.slice(0, 5)}-${body.slice(5)}`;
  }
  return `(${ddd}) ${body.slice(0, 4)}-${body.slice(4)}`;
}

export function formatPixKeyForDisplay(
  key: string | null | undefined,
  type: PixKeyType | null | undefined
): string {
  if (!key) return "";
  if (type === "cpf") return formatCpfForDisplay(key);
  if (type === "phone") return formatPhoneForDisplay(key);
  if (type === "cnpj") {
    const d = key.replace(/\D+/g, "");
    if (d.length !== 14) return key;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return key;
}

export function pixKeyTypeLabel(type: PixKeyType | null | undefined): string {
  switch (type) {
    case "cpf":
      return "CPF";
    case "cnpj":
      return "CNPJ";
    case "email":
      return "E-mail";
    case "phone":
      return "Celular";
    case "random":
      return "Aleatória";
    default:
      return "";
  }
}
