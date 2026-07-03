import { AppError } from "../core/errors.js";

function parseIsoDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Para PATCH de gestacao: `null` limpa data opcional; `undefined` omite. */
export function parseOptionalIsoDateOnlyNullable(value: unknown, fieldName: string): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const parsed = parseIsoDateOnly(value);
  if (!parsed) {
    throw new AppError("validation_error", `${fieldName} deve estar no formato YYYY-MM-DD.`, 400);
  }
  return parsed;
}
