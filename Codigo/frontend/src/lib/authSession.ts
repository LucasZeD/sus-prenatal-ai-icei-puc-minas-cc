/** Chave do JWT no `sessionStorage` (RF14). */
export const AUTH_TOKEN_STORAGE_KEY = "prenatal_jwt";

/** Perfil exibido na UI após login (mesma origem que `POST /auth/login`). */
export const AUTH_PROFISSIONAL_STORAGE_KEY = "prenatal_profissional";

export type StoredProfissional = { nome: string; email: string };

export function loadStoredProfissional(): StoredProfissional | null {
  try {
    const raw = sessionStorage.getItem(AUTH_PROFISSIONAL_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    if (typeof r.nome !== "string" || typeof r.email !== "string") return null;
    return { nome: r.nome.trim() || "Profissional", email: r.email.trim() };
  } catch {
    return null;
  }
}

export function saveStoredProfissional(p: StoredProfissional): void {
  sessionStorage.setItem(AUTH_PROFISSIONAL_STORAGE_KEY, JSON.stringify(p));
}

export function clearStoredProfissional(): void {
  sessionStorage.removeItem(AUTH_PROFISSIONAL_STORAGE_KEY);
}

/** Só para exibir e-mail se existir JWT antigo sem perfil salvo (não valida assinatura). */
export function decodeJwtPayloadUnsafe<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const json = JSON.parse(atob(b64)) as T;
    return json;
  } catch {
    return null;
  }
}
