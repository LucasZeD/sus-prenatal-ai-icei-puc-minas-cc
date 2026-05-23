/**
 * Criação de profissionais via Dev Sandbox → desligado por padrão.
 * Ative com DEV_ALLOW_PROFISSIONAL_CREATE=1 e restrinja com DEV_ADMIN_EMAILS (lista separada por vírgula).
 */

export function isProfissionalCreateAllowed(): boolean {
  return process.env.DEV_ALLOW_PROFISSIONAL_CREATE?.trim() === "1";
}

/** E-mails que podem chamar POST /dev/profissionais. Se DEV_ADMIN_EMAILS vazio, usa só SEED_PROFISSIONAL_EMAIL. */
/** Exclusão de pacientes/gestações via Dev Sandbox → desligado por padrão. Requer também JWT de admin (DEV_ADMIN_EMAILS). */
export function isSandboxDbDeleteAllowed(): boolean {
  return process.env.DEV_ALLOW_SANDBOX_DB_DELETE?.trim() === "1";
}

export function isEmailDevAdmin(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const raw = process.env.DEV_ADMIN_EMAILS?.trim();
  if (raw) {
    const list = raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return list.includes(normalized);
  }
  const seed = process.env.SEED_PROFISSIONAL_EMAIL?.trim().toLowerCase();
  return Boolean(seed && normalized === seed);
}
