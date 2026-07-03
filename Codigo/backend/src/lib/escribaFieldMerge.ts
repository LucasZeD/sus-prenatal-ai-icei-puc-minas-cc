/** Campos clinicos extraiveis do Escriba (subset alinhado a ConsultaPatchInput). */
export type ConsultaClinicalFields = {
  queixa?: string | null;
  peso?: number | null;
  pa_sistolica?: number | null;
  pa_diastolica?: number | null;
  idade_gestacional?: number | null;
  au?: number | null;
  bfc?: number | null;
  mov_fetal?: string | null;
  apresentacao_fetal?: string | null;
  is_edema?: boolean;
  is_exantema?: boolean;
};

const ALLOWED_KEYS = new Set<keyof ConsultaClinicalFields>([
  "queixa",
  "peso",
  "pa_sistolica",
  "pa_diastolica",
  "idade_gestacional",
  "au",
  "bfc",
  "mov_fetal",
  "apresentacao_fetal",
  "is_edema",
  "is_exantema",
]);

function isNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return true;
  if (typeof value === "number" && Number.isFinite(value)) return true;
  return false;
}

function inRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max;
}

function normalizeMovFetal(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "preservado" || v === "presente" || v === "sim" || v === "ativo") {
    return "Preservado";
  }
  if (v === "reduzido" || v === "diminuido" || v === "nao" || v === "ausente") {
    return "Reduzido";
  }
  if (value === "Preservado" || value === "Reduzido") {
    return value;
  }
  return null;
}

function sanitizePatchValue(key: keyof ConsultaClinicalFields, value: unknown): unknown {
  if (value === null || value === undefined) return undefined;

  switch (key) {
    case "queixa":
    case "apresentacao_fetal":
      return typeof value === "string" && value.trim() ? value.trim() : undefined;
    case "peso":
      return typeof value === "number" && inRange(value, 30, 200) ? value : undefined;
    case "pa_sistolica":
    case "pa_diastolica":
      return typeof value === "number" && inRange(value, 60, 250) ? Math.round(value) : undefined;
    case "idade_gestacional":
      return typeof value === "number" && inRange(value, 4, 44) ? Math.round(value) : undefined;
    case "au":
    case "bfc":
      return typeof value === "number" && value > 0 && value <= 60 ? value : undefined;
    case "mov_fetal":
      return normalizeMovFetal(value) ?? undefined;
    case "is_edema":
    case "is_exantema":
      return typeof value === "boolean" ? value : undefined;
    default:
      return undefined;
  }
}

/** Valida e normaliza patch clinico recebido do cliente (WebSocket / extracao IA). */
export function sanitizeClinicalFieldsPatch(
  patch: Partial<ConsultaClinicalFields>,
): Partial<ConsultaClinicalFields> {
  return cleanPatch(patch);
}

function cleanPatch(patch: Partial<ConsultaClinicalFields>): Partial<ConsultaClinicalFields> {
  const out: Partial<ConsultaClinicalFields> = {};
  for (const [rawKey, rawValue] of Object.entries(patch)) {
    const key = rawKey as keyof ConsultaClinicalFields;
    if (!ALLOWED_KEYS.has(key)) continue;
    const v = sanitizePatchValue(key, rawValue);
    if (v !== undefined) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

/**
 * Mescla patch extraido pela IA sem sobrescrever campos ja preenchidos na sessao.
 * Retorna apenas as chaves efetivamente aplicadas (delta para form_patch).
 */
export function mergeExtractedFields(
  current: ConsultaClinicalFields,
  patch: Partial<ConsultaClinicalFields>,
): Partial<ConsultaClinicalFields> {
  const cleaned = cleanPatch(patch);
  const delta: Partial<ConsultaClinicalFields> = {};

  for (const [rawKey, rawValue] of Object.entries(cleaned)) {
    const key = rawKey as keyof ConsultaClinicalFields;
    const existing = current[key];

    if (key === "queixa") {
      const incoming = rawValue as string;
      if (!isNonEmpty(existing)) {
        delta.queixa = incoming;
      } else if (typeof existing === "string" && !existing.includes(incoming)) {
        delta.queixa = `${existing.trim()}; ${incoming}`;
      }
      continue;
    }

    if (isNonEmpty(existing)) {
      continue;
    }

    (delta as Record<string, unknown>)[key] = rawValue;
  }

  return delta;
}

/** Aplica delta ao estado acumulado da sessao. */
export function applyFieldsDelta(
  current: ConsultaClinicalFields,
  delta: Partial<ConsultaClinicalFields>,
): ConsultaClinicalFields {
  const next: ConsultaClinicalFields = { ...current };
  for (const [rawKey, rawValue] of Object.entries(delta)) {
    const key = rawKey as keyof ConsultaClinicalFields;
    if (!ALLOWED_KEYS.has(key)) continue;
    (next as Record<string, unknown>)[key] = rawValue;
  }
  return next;
}

/** Converte registro Consulta do banco para snapshot de campos da sessao. */
export function consultaRowToClinicalFields(row: {
  queixa?: string | null;
  peso?: number | null;
  pa_sistolica?: number | null;
  pa_diastolica?: number | null;
  idade_gestacional?: number | null;
  au?: number | null;
  bfc?: number | null;
  mov_fetal?: string | null;
  apresentacao_fetal?: string | null;
  is_edema?: boolean;
  is_exantema?: boolean;
}): ConsultaClinicalFields {
  return {
    queixa: row.queixa ?? null,
    peso: row.peso ?? null,
    pa_sistolica: row.pa_sistolica ?? null,
    pa_diastolica: row.pa_diastolica ?? null,
    idade_gestacional: row.idade_gestacional ?? null,
    au: row.au ?? null,
    bfc: row.bfc ?? null,
    mov_fetal: row.mov_fetal ?? null,
    apresentacao_fetal: row.apresentacao_fetal ?? null,
    is_edema: row.is_edema ?? false,
    is_exantema: row.is_exantema ?? false,
  };
}

export function escribaExtractEnabled(): boolean {
  const raw = process.env.ESCRIBA_EXTRACT_ENABLED?.trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no";
}
