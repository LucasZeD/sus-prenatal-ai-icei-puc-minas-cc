/**
 * Camada complementar contra prompt injection em texto enviado a LLM.
 * Usada no gateway de privacidade (antes/depois do clinical-ai) e no modo noop.
 * Mantida alinhada em esprito a `clinical_ai/prompt_sanitize.py`.
 */

const ZW_RE = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

const ROLE_LINE_RE = /^\s*(?:system|assistant|tool)\s*:/gim;

const MODEL_MARKERS_RE =
  /<\|im_start\|>[\s\S]*?<\|im_end\|>|<\|im_start\|>|<\|im_end\|>|<\|im_\w+\|>|\[\/INST\]|\[INST\]|<<\/SYS>>|<<SYS>>|<\|eot_id\|>|<\|start_header_id\|>|<\|end_header_id\|>/gi;

const FENCED_SYSTEM_RE = /```\s*system\b[\s\S]*?(```|$)/gi;

const INJECTION_RES: RegExp[] = [
  /\bignore(?:\s+all)?\s+(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?|directions?)\b/gi,
  /\bdisregard(?:\s+all)?\s+(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)\b/gi,
  /\bforget\s+(?:everything|all)\s+(?:you(?:'ve)?|your|about)\b/gi,
  /\bdeveloper\s+message\s*:/gi,
  /\bnew\s+system\s+prompt\b/gi,
  /\boverride\s+the\s+(?:system|safety)\b/gi,
  /\bjailbreak\b|\bDAN\s+mode\b/gi,
  /\bend\s+of\s+(?:system|user)\s+message\b/gi,
  /ignore\s+(?:todas?\s+)?(?:as\s+)?(?:instru[c][o]es|regras)\s*(?:anteriores|prvias|previas)?/gi,
  /\bdesconsidere\s+(?:todas?\s+)?(?:as\s+)?(?:instru[c][o]es|regras)\b/gi,
  /(?:voc|voce)\s+agora\s+\s+um\s+assistente\b/gi,
  /finja(?:\s+que)?\s+(?:ser|voc|voce)\b/gi,
  /esque(?:a|ca)\s+(?:todas?\s+)?(?:as\s+)?(?:instru[c][o]es|regras)\b/gi,
  /revel(?:e|ar)\s+(?:a|o|sua)\s+(?:senha|password|token|api[_\s-]?key)\b/gi,
  /<\s*script\b|javascript\s*:/gi,
];

const HARD_INPUT_CAP = 50_000;

function stripControls(s: string): string {
  let out = "";
  for (const ch of s) {
    const o = ch.codePointAt(0) ?? 0;
    if (ch === "\t" || ch === "\n" || ch === "\r") out += ch;
    else if (o >= 0x20 && o !== 0x7f) out += ch;
    else out += " ";
  }
  return out;
}

/** Remove trechos tpicos de injeo e caracteres invisveis; trunca a `maxChars` (padro 12k). */
export function stripUntrustedLlmText(text: string, maxChars = 12_000): string {
  if (!text) return "";
  let t = text.length <= HARD_INPUT_CAP ? text : text.slice(0, HARD_INPUT_CAP);
  t = t.normalize("NFC").replace(ZW_RE, "");
  t = stripControls(t);
  t = t.replace(MODEL_MARKERS_RE, " ");
  t = t.replace(FENCED_SYSTEM_RE, " ");
  t = t.replace(ROLE_LINE_RE, "[texto redigido] ");
  for (const re of INJECTION_RES) {
    t = t.replace(re, " ");
  }
  t = t.replace(/[ \t\f\v]{2,}/g, " ").replace(/\n{5,}/g, "\n\n\n\n").trim();
  if (maxChars > 0 && t.length > maxChars) {
    t = `${t.slice(0, maxChars - 1)}`;
  }
  return t;
}
