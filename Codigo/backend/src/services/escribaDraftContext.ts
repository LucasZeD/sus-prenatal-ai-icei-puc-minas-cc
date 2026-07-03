import type { ConsultaClinicalFields } from "../lib/escribaFieldMerge.js";
import { sanitizeClinicalFieldsPatch } from "../lib/escribaFieldMerge.js";

const MAX_DRAFT_CONTEXT_CHARS = 2_000;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}\u2026`;
}

/** Aceita snapshot do formulario enviado pelo front (nao persiste). */
export function sanitizeProntuarioDraftFromClient(raw: Record<string, unknown>): Partial<ConsultaClinicalFields> {
  return sanitizeClinicalFieldsPatch(raw as Partial<ConsultaClinicalFields>);
}

/**
 * Texto de contexto para o agente de sugestoes do Escriba.
 * Deixa explicito que os dados sao rascunho nao salvo.
 */
export function formatProntuarioDraftContext(fields: Partial<ConsultaClinicalFields>): string {
  const lines: string[] = [];

  if (fields.queixa?.trim()) {
    lines.push(`Queixa (rascunho): ${truncate(fields.queixa.trim(), 500)}`);
  }
  if (fields.idade_gestacional != null) {
    lines.push(`IG (rascunho): ${fields.idade_gestacional} semanas`);
  }
  if (fields.peso != null) {
    lines.push(`Peso (rascunho): ${fields.peso} kg`);
  }
  if (fields.pa_sistolica != null || fields.pa_diastolica != null) {
    lines.push(
      `PA (rascunho): ${fields.pa_sistolica ?? "?"}/${fields.pa_diastolica ?? "?"} mmHg`,
    );
  }
  if (fields.au != null) {
    lines.push(`AU (rascunho): ${fields.au} cm`);
  }
  if (fields.bfc != null) {
    lines.push(`BFC (rascunho): ${fields.bfc}`);
  }
  if (fields.mov_fetal) {
    lines.push(`Movimento fetal (rascunho): ${fields.mov_fetal}`);
  }
  if (fields.apresentacao_fetal?.trim()) {
    lines.push(`Apresentacao fetal (rascunho): ${fields.apresentacao_fetal.trim()}`);
  }
  if (fields.is_edema === true) {
    lines.push("Edema (rascunho): sim");
  } else if (fields.is_edema === false) {
    lines.push("Edema (rascunho): nao");
  }
  if (fields.is_exantema === true) {
    lines.push("Exantema (rascunho): sim");
  } else if (fields.is_exantema === false) {
    lines.push("Exantema (rascunho): nao");
  }

  if (lines.length === 0) {
    return "";
  }

  const body = [
    "### Rascunho do prontuario (nao salvo \u2014 pode divergir do banco)",
    "- Valores provisorios digitados na consulta; ainda nao persistidos como prontuario oficial.",
    "- Use para sugestoes clinicas, mas nao trate como dado assinado ou confirmado.",
    ...lines,
  ].join("\n");

  return truncate(body, MAX_DRAFT_CONTEXT_CHARS);
}
