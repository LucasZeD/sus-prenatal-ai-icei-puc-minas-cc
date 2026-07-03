import { streamEscribaExtractFields, collectEscribaExtractJson } from "../lib/clinicalAiClient.js";
import type { ConsultaClinicalFields } from "../lib/escribaFieldMerge.js";
import { buildLiviaContext } from "./liviaContextService.js";

export type EscribaExtractResult = {
  patch: Partial<ConsultaClinicalFields>;
  confidence: Record<string, number>;
  sources: Record<string, string>;
};

const ALLOWED_PATCH_KEYS = new Set<keyof ConsultaClinicalFields>([
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

function normalizeExtractPayload(data: Record<string, unknown>): EscribaExtractResult | null {
  const patchRaw = data.patch;
  if (!patchRaw || typeof patchRaw !== "object" || Array.isArray(patchRaw)) {
    return null;
  }

  const patch: Partial<ConsultaClinicalFields> = {};
  for (const [k, v] of Object.entries(patchRaw as Record<string, unknown>)) {
    const key = k as keyof ConsultaClinicalFields;
    if (!ALLOWED_PATCH_KEYS.has(key)) continue;
    if (v === null || v === undefined) continue;
    (patch as Record<string, unknown>)[key] = v;
  }

  const confidence =
    data.confidence && typeof data.confidence === "object" && !Array.isArray(data.confidence)
      ? (data.confidence as Record<string, number>)
      : {};
  const sources =
    data.sources && typeof data.sources === "object" && !Array.isArray(data.sources)
      ? (data.sources as Record<string, string>)
      : {};

  return { patch, confidence, sources };
}

/**
 * Extrai campos estruturados da ficha via clinical-ai (RF04).
 */
export async function extractEscribaFields(
  consultaId: string,
  sanitizedTranscription: string,
  currentFields: ConsultaClinicalFields,
): Promise<EscribaExtractResult | null> {
  const transcription = sanitizedTranscription.trim();
  if (!transcription) {
    return null;
  }

  let gestacao_context = "";
  let consulta_escriba_context = "";
  try {
    const ctx = await buildLiviaContext({
      question: transcription,
      consulta_id: consultaId,
    });
    gestacao_context = ctx.gestacao_context;
    consulta_escriba_context = ctx.consulta_escriba_context;
  } catch {
    /* consulta/gestacao indisponivel */
  }

  const current_fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(currentFields)) {
    if (v !== null && v !== undefined && v !== "") {
      current_fields[k] = v;
    }
  }

  try {
    const stream = streamEscribaExtractFields({
      transcription,
      gestacao_context: gestacao_context || undefined,
      consulta_escriba_context: consulta_escriba_context || undefined,
      current_fields: Object.keys(current_fields).length > 0 ? current_fields : undefined,
      top_k: 0,
    });
    const rawJson = await collectEscribaExtractJson(stream);
    if (!rawJson) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      return null;
    }

    return normalizeExtractPayload(parsed);
  } catch {
    return null;
  }
}
