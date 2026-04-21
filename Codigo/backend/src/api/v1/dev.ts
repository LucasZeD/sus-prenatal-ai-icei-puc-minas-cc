import type { Hono } from "hono";
import { AppError } from "../../core/errors.js";
import type { AuthVariables } from "../../middleware/requireAuth.js";
import { mcpGateway } from "../../lib/privacyMcpGateway.js";
import { OllamaStreamClient } from "../../lib/llm/ollamaStreamClient.js";

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    throw new AppError("validation_error", "Payload inválido.", 400);
  }
  return body as Record<string, unknown>;
}

async function readJsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError("bad_request", "Corpo da requisição deve ser JSON.", 400);
  }
  return asRecord(body);
}

/** Rotas auxiliares para testes manuais (Dev Sandbox). */
export function registerDevV1Routes(v1: Hono<{ Variables: AuthVariables }>): void {
  v1.post("/dev/sanitize", async (c) => {
    const rec = await readJsonBody(c);
    const input = rec.input;
    if (typeof input !== "string" || !input.trim()) {
      throw new AppError("validation_error", "Campo `input` é obrigatório.", 400);
    }

    const gateway = mcpGateway();
    const sanitized = await gateway.sanitizeForModel(input);
    return c.json({
      gateway: gateway.kind,
      inputChars: input.length,
      outputChars: sanitized.length,
      output: sanitized,
    });
  });

  v1.post("/dev/ollama/insight", async (c) => {
    const rec = await readJsonBody(c);
    const input = rec.input;
    const maxCharsRaw = rec.maxChars;
    const maxChars = typeof maxCharsRaw === "number" && Number.isFinite(maxCharsRaw) ? Math.trunc(maxCharsRaw) : 1500;
    if (typeof input !== "string" || !input.trim()) {
      throw new AppError("validation_error", "Campo `input` é obrigatório.", 400);
    }

    const gateway = mcpGateway();
    const sanitized = await gateway.sanitizeForModel(input);

    const llm = new OllamaStreamClient();
    let out = "";
    for await (const token of llm.streamInsight(sanitized)) {
      out += token;
      if (out.length >= maxChars) {
        out = out.slice(0, maxChars);
        break;
      }
    }

    return c.json({
      gateway: gateway.kind,
      sanitizedChars: sanitized.length,
      output: out,
      truncated: out.length >= maxChars,
    });
  });
}

