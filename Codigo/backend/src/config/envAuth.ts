import { AppError } from "../core/errors.js";

/** RF14 / JWT — segredo mínimo para HS256 seguro em dev. */
const MIN_SECRET_LEN = 32;

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < MIN_SECRET_LEN) {
    throw new AppError(
      "misconfigured",
      `JWT_SECRET ausente ou curta (mínimo ${MIN_SECRET_LEN} caracteres). Defina em Codigo/.env.`,
      503,
    );
  }
  return s;
}

export function getJwtExpiresSec(): number {
  const raw = process.env.JWT_EXPIRES_SEC?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n > 60 && n <= 86400 * 7) {
    return n;
  }
  return 8 * 3600;
}
