/**
 * Normaliza jargao obstetrico em transcricoes por extenso (PT-BR).
 * Aplicado no Escriba antes da sanitizacao MCP / insight LLM.
 */

const UNITS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
};

const TENS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50 };

function asciiLower(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function parsePtNumberWords(fragment: string): number | null {
  const t = asciiLower(fragment.trim()).replace(/\s+/g, " ");
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number.parseInt(t, 10);
    return n > 0 && n <= 42 ? n : null;
  }
  if (t in UNITS) return UNITS[t] ?? null;
  const m = t.match(
    /^(vinte|trinta|quarenta)\s+(?:e\s+)?(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)$/,
  );
  if (m) {
    const tens = TENS[m[1]];
    const unit = UNITS[m[2]];
    if (tens !== undefined && unit !== undefined) return tens + unit;
  }
  const m2 = t.match(/^cento\s+e\s+(\w+)$/);
  if (m2) {
    const rest = m2[1];
    if (rest in UNITS) return 100 + (UNITS[rest] ?? 0);
  }
  return null;
}

/** Normaliza IG/BCF/AU quando falados por extenso. */
export function normalizeObstetricJargon(text: string): string {
  if (!text?.trim()) return text;

  let out = text;

  out = out.replace(
    /\bIG\s+de\s+((?:vinte|trinta|quarenta)(?:\s+e\s+\w+|\s+\w+)?|\w+(?:\s+\w+)?)\s+semanas\b/gi,
    (full, frag: string) => {
      const num = parsePtNumberWords(frag);
      return num === null ? full : `IG de ${num} semanas`;
    },
  );

  out = out.replace(/\bBCF\s+(cento\s+e\s+\w+|\w+(?:\s+e\s+\w+)?)\b/gi, (full, frag: string) => {
    const num = parsePtNumberWords(frag);
    return num === null ? full : `BCF ${num}`;
  });

  out = out.replace(/\bAU\s+(vinte|trinta|quarenta|\w+)\b/gi, (full, frag: string) => {
    const num = parsePtNumberWords(frag);
    return num === null ? full : `AU ${num}`;
  });

  return out;
}
