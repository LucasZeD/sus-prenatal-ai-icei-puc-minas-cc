import { clinicalAiProxyConcurrencyLimiter } from "./concurrencyLimiter.js";
import { normalizeHttpBase } from "./httpUrl.js";

export type EscribaSuggestInput = {
  transcription: string;
  gestacao_context?: string;
  consulta_escriba_context?: string;
  top_k?: number;
};

export type EscribaExtractFieldsInput = {
  transcription: string;
  gestacao_context?: string;
  consulta_escriba_context?: string;
  current_fields?: Record<string, unknown>;
  top_k?: number;
};

export type EscribaExtractJson = {
  patch: Record<string, unknown>;
  confidence?: Record<string, number>;
  sources?: Record<string, string>;
};

function clinicalAiBaseUrl(): string {
  const u = process.env.CLINICAL_AI_URL?.trim();
  if (!u) {
    throw new Error("clinical_ai_url_missing");
  }
  return normalizeHttpBase(u);
}

/**
 * Stream NDJSON do clinical-ai `/mcp/escriba/suggest-stream` (Markdown em `content`).
 */
export async function* streamEscribaSuggest(input: EscribaSuggestInput): AsyncGenerator<string, void, undefined> {
  const transcription = input.transcription.trim();
  if (!transcription) {
    return;
  }

  const root = clinicalAiBaseUrl();
  const release = clinicalAiProxyConcurrencyLimiter.acquire();
  try {
    const res = await fetch(`${root}/mcp/escriba/suggest-stream`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({
        transcription,
        gestacao_context: input.gestacao_context ?? undefined,
        consulta_escriba_context: input.consulta_escriba_context ?? undefined,
        top_k: input.top_k ?? 2,
        rag_expand_query: false,
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`clinical_ai_escriba_${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let row: Record<string, unknown>;
        try {
          row = JSON.parse(t) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type = typeof row.type === "string" ? row.type : "";
        if (type === "error") {
          const detail = typeof row.detail === "string" ? row.detail : "Falha no clinical-ai.";
          throw new Error(detail);
        }
        if (type === "done") {
          return;
        }
        if (type === "ollama" && typeof row.content === "string" && row.content.length > 0) {
          yield row.content;
        }
      }
    }

    const tail = buf.trim();
    if (tail) {
      try {
        const row = JSON.parse(tail) as Record<string, unknown>;
        if (row.type === "ollama" && typeof row.content === "string" && row.content.length > 0) {
          yield row.content;
        }
      } catch {
        /* ignore */
      }
    }
  } finally {
    release();
  }
}

/**
 * Stream NDJSON do clinical-ai `/mcp/escriba/extract-fields-stream` (JSON em `content`).
 */
export async function* streamEscribaExtractFields(
  input: EscribaExtractFieldsInput,
): AsyncGenerator<string, void, undefined> {
  const transcription = input.transcription.trim();
  if (!transcription) {
    return;
  }

  const root = clinicalAiBaseUrl();
  const release = clinicalAiProxyConcurrencyLimiter.acquire();
  try {
    const res = await fetch(`${root}/mcp/escriba/extract-fields-stream`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({
        transcription,
        gestacao_context: input.gestacao_context ?? undefined,
        consulta_escriba_context: input.consulta_escriba_context ?? undefined,
        current_fields: input.current_fields ?? undefined,
        top_k: input.top_k ?? 0,
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`clinical_ai_escriba_extract_${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let row: Record<string, unknown>;
        try {
          row = JSON.parse(t) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type = typeof row.type === "string" ? row.type : "";
        if (type === "error") {
          const detail = typeof row.detail === "string" ? row.detail : "Falha no clinical-ai.";
          throw new Error(detail);
        }
        if (type === "done") {
          return;
        }
        if (type === "ollama" && typeof row.content === "string" && row.content.length > 0) {
          yield row.content;
        }
      }
    }

    const tail = buf.trim();
    if (tail) {
      try {
        const row = JSON.parse(tail) as Record<string, unknown>;
        if (row.type === "ollama" && typeof row.content === "string" && row.content.length > 0) {
          yield row.content;
        }
      } catch {
        /* ignore */
      }
    }
  } finally {
    release();
  }
}

/** Acumula tokens do stream de extracao e retorna JSON bruto. */
export async function collectEscribaExtractJson(
  generator: AsyncGenerator<string, void, undefined>,
): Promise<string | null> {
  let raw = "";
  for await (const token of generator) {
    raw += token;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
