/** Trecho normalizado para deduplicar flushes consecutivos iguais. */
export function transcriptFingerprint(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

const FILLER_ONLY =
  /^(ok|hum|hm|ah|eh|sim|nao|não|obrigad[ao]|oi|bom dia|boa tarde|boa noite|tchau|certo|entendi|e isso|pronto|pode ser|ta|tão|legal|beleza|am[eé]m|valeu|aplausos)[\s.!?,]*$/iu;

/** Trecho que é só cumprimento/filler (alucinação comum do Whisper em silêncio). */
export function isFillerOnly(text: string): boolean {
  return FILLER_ONLY.test(text.trim());
}

export type SttTextSegment = { start: number; end: number; text: string };

export type DiarizedFilterSegment = { speaker: string; role: string; text: string };

/** Remove segmentos STT cujo texto é só filler. */
export function filterSttSegments(segments: SttTextSegment[]): SttTextSegment[] {
  return segments.filter((s) => !isFillerOnly(s.text));
}

/** Remove blocos diarizados cujo texto inteiro é filler. */
export function filterDiarizedSegments(segments: DiarizedFilterSegment[]): DiarizedFilterSegment[] {
  return segments.filter((s) => !isFillerOnly(s.text));
}

/** Indícios de conteúdo clínico na transcrição (gate antes do LLM). */
const CLINICAL_SIGNAL =
  /\b(queixa|reclam|dor|press[aã]o|\bpa\b|edema|sangramento|contra[cã][aã]o|fetal|gestante|gesta[cã][aã]o|semanas?|\big\b|peso|diabetes|hipertens|febre|vomito|n[aã]usea|exame|vacina|medic|conduta|pre[\s-]?eclamps|proteinuria|bfc|batimento|movimento|cefal|exantema|infecc|sifilis|hiv|urina|altura uterina|\bau\b|cefaleia|tontura|visao|escotoma|lombar|pelve|urin|moviment)/iu;

/**
 * Evita chamar RAG+LLM em trechos muito curtos, são cumprimento ou sem sinal clínico.
 */
export function hasClinicalSignal(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isFillerOnly(t)) return false;
  if (CLINICAL_SIGNAL.test(t)) return true;
  return t.length >= 48;
}

const EMPTY_LABEL_LINE =
  /^\*?\*?\s*(pergunta|conduta|alerta)\s*:?\*?\*?\s*(nenhum[ao]?|nada|nao ha|no hã|nao haver|não haver|sem\s|não existe|nao existe|não\s+foi|nao\s+foi|neste momento|identificad|para conduta|a serem feitas|clinicas a serem)/iu;

const SECTION_HEADER_ONLY = /^#{1,3}\s*(perguntas?|conduta|alertas?)\s*(sugerid[oa]s?)?\s*$/iu;

/**
 * Respostas do modelo que são negam sugestão (PERGUNTA: Nenhuma, etc.).
 */
export function isNoiseInsight(text: string): boolean {
  const t = text.trim();
  if (!t || t === "ã" || t === "-" || t === "_Sem sugestoes neste trecho._") return true;

  const lines = t
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter((line) => line.length > 0 && !SECTION_HEADER_ONLY.test(line));

  if (lines.length === 0) return true;
  return lines.every((line) => EMPTY_LABEL_LINE.test(line));
}
