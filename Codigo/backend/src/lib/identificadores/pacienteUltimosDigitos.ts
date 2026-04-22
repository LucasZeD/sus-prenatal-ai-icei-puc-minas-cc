function somenteDigitos(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Últimos 4 dígitos do CPF (11 dígitos após normalização) ou `null` se inválido. */
export function extrairUltimos4Cpf(raw: string): string | null {
  const d = somenteDigitos(raw);
  if (d.length !== 11) return null;
  return d.slice(-4);
}

/** Últimos 4 dígitos do Cartão SUS (≥15 dígitos) ou `null` se inválido. */
export function extrairUltimos4CartaoSus(raw: string): string | null {
  const d = somenteDigitos(raw);
  if (d.length < 15) return null;
  return d.slice(-4);
}
