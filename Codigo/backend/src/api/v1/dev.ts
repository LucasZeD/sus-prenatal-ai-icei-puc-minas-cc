import type { Hono } from "hono";
import { AppError } from "../../core/errors.js";
import { isEmailDevAdmin, isProfissionalCreateAllowed, isSandboxDbDeleteAllowed } from "../../config/devAdmin.js";
import type { AuthVariables } from "../../middleware/requireAuth.js";
import { normalizeHttpBase } from "../../lib/httpUrl.js";
import { mcpGateway } from "../../lib/privacyMcpGateway.js";
import { OllamaStreamClient } from "../../lib/llm/ollamaStreamClient.js";
import {
  clinicalAiProxyConcurrencyLimiter,
  ConcurrencyLimitExceededError,
} from "../../lib/concurrencyLimiter.js";
import { GestacaoRepository } from "../../repository/gestacaoRepository.js";
import { PacienteRepository } from "../../repository/pacienteRepository.js";
import { ProfissionalRepository } from "../../repository/profissionalRepository.js";
import { isUuid } from "../../lib/validation/uuid.js";
import { hashSenhaProfissional } from "../../services/authService.js";

function clinicalAiBaseUrl(): string | null {
  const u = process.env.CLINICAL_AI_URL?.trim();
  return u || null;
}

async function proxyClinicalAi(
  path: string,
  init: RequestInit,
  errorContext: string,
): Promise<{ status: number; bodyText: string; contentType: string | null }> {
  const base = clinicalAiBaseUrl();
  if (!base) {
    throw new AppError("service_unavailable", "Defina CLINICAL_AI_URL no Codigo/.env para usar proxies RAG/MCP.", 503);
  }
  const root = normalizeHttpBase(base);
  try {
    return await clinicalAiProxyConcurrencyLimiter.run(async () => {
      const res = await fetch(`${root}${path}`, init);
      const bodyText = await res.text();
      return { status: res.status, bodyText, contentType: res.headers.get("content-type") };
    });
  } catch (e: unknown) {
    throw devUpstreamAppError(errorContext, e);
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    throw new AppError("validation_error", "Payload inválido.", 400);
  }
  return body as Record<string, unknown>;
}

/** Converte falhas de rede / upstream em resposta JSON clara (evita 500 genérico nas rotas /dev). */
function devUpstreamAppError(context: string, err: unknown): AppError {
  if (err instanceof ConcurrencyLimitExceededError) {
    return new AppError(err.code, err.message, 429);
  }
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  const unreachable =
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("network") ||
    lower.includes("socket");
  if (unreachable) {
    return new AppError(
      "bad_gateway",
      `${context}: serviço remoto inacessível. Confira CLINICAL_AI_URL / MCP_SERVER_URL, Docker/rede e se o clinical-ai está no ar.`,
      502,
    );
  }
  if (raw.startsWith("mcp_sanitize_http_")) {
    const st = raw.slice("mcp_sanitize_http_".length).split(":")[0] ?? "?";
    return new AppError(
      "bad_gateway",
      `${context}: privacy/sanitize retornou HTTP ${st} (clinical-ai ou MCP).`,
      502,
    );
  }
  if (raw === "mcp_sanitize_invalid_json") {
    return new AppError("bad_gateway", `${context}: resposta do sanitize não é JSON válido.`, 502);
  }
  if (raw.startsWith("ollama_http_")) {
    const st = raw.slice("ollama_http_".length);
    return new AppError(
      "bad_gateway",
      `${context}: Ollama retornou HTTP ${st}. Confira OLLAMA_HTTP_URL, modelo (OLLAMA_MODEL) e se o Ollama está acessível do backend.`,
      502,
    );
  }
  return new AppError("bad_gateway", `${context}: ${raw}`, 502);
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

const SEED_UNIDADE_ID = "00000000-0000-4000-8000-000000000001";

/** Rotas auxiliares para testes manuais (Dev Sandbox). */
export function registerDevV1Routes(v1: Hono<{ Variables: AuthVariables }>): void {
  v1.get("/dev/profissionais/eligibility", (c) => {
    const p = c.get("profissional");
    return c.json({
      createEnabled: isProfissionalCreateAllowed(),
      callerIsAdmin: isEmailDevAdmin(p.email),
    });
  });

  v1.get("/dev/sandbox/db-delete-eligibility", (c) => {
    const p = c.get("profissional");
    return c.json({
      deleteEnabled: isSandboxDbDeleteAllowed(),
      callerIsAdmin: isEmailDevAdmin(p.email),
    });
  });

  v1.delete("/dev/pacientes/:id", async (c) => {
    if (!isSandboxDbDeleteAllowed()) {
      return c.json({ code: "not_found", message: "Exclusão via sandbox desligada no servidor (DEV_ALLOW_SANDBOX_DB_DELETE)." }, 404);
    }
    const actor = c.get("profissional");
    if (!isEmailDevAdmin(actor.email)) {
      throw new AppError("forbidden", "Apenas administrador de desenvolvimento pode excluir cadastros de teste.", 403);
    }
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador inválido.", 400);
    }
    const repo = new PacienteRepository();
    try {
      await repo.deleteById(id);
    } catch (e: unknown) {
      const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
      if (code === "P2025") {
        throw new AppError("not_found", "Gestante não encontrada ou já removida.", 404);
      }
      throw e;
    }
    return new Response(null, { status: 204 });
  });

  v1.delete("/dev/gestacoes/:id", async (c) => {
    if (!isSandboxDbDeleteAllowed()) {
      return c.json({ code: "not_found", message: "Exclusão via sandbox desligada no servidor (DEV_ALLOW_SANDBOX_DB_DELETE)." }, 404);
    }
    const actor = c.get("profissional");
    if (!isEmailDevAdmin(actor.email)) {
      throw new AppError("forbidden", "Apenas administrador de desenvolvimento pode excluir cadastros de teste.", 403);
    }
    const id = c.req.param("id");
    if (!isUuid(id)) {
      throw new AppError("validation_error", "Identificador inválido.", 400);
    }
    const repo = new GestacaoRepository();
    try {
      await repo.deleteById(id);
    } catch (e: unknown) {
      const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
      if (code === "P2025") {
        throw new AppError("not_found", "Gestação não encontrada ou já removida.", 404);
      }
      throw e;
    }
    return new Response(null, { status: 204 });
  });

  v1.post("/dev/profissionais", async (c) => {
    if (!isProfissionalCreateAllowed()) {
      return c.json({ code: "not_found", message: "Criação via API desativada (DEV_ALLOW_PROFISSIONAL_CREATE)." }, 404);
    }
    const actor = c.get("profissional");
    if (!isEmailDevAdmin(actor.email)) {
      throw new AppError("forbidden", "Apenas e-mail administrador (DEV_ADMIN_EMAILS / seed) pode criar profissionais.", 403);
    }

    const rec = await readJsonBody(c);
    const emailRaw = rec.email;
    const password = rec.password;
    const nomeRaw = rec.nome;
    const registro = rec.registro;
    if (typeof emailRaw !== "string" || !emailRaw.trim()) {
      throw new AppError("validation_error", "Campo `email` é obrigatório.", 400);
    }
    if (typeof password !== "string" || password.length < 8) {
      throw new AppError("validation_error", "Campo `password` deve ter pelo menos 8 caracteres.", 400);
    }
    if (typeof nomeRaw !== "string" || nomeRaw.trim().length < 2) {
      throw new AppError("validation_error", "Campo `nome` é obrigatório (mín. 2 caracteres).", 400);
    }
    const email = emailRaw.trim().toLowerCase();
    const nome = nomeRaw.trim();
    const registroStr = typeof registro === "string" && registro.trim() ? registro.trim() : null;

    const repo = new ProfissionalRepository();
    const senha_hash = await hashSenhaProfissional(password);
    try {
      const created = await repo.create({
        email,
        senha_hash,
        nome,
        unidade_id: SEED_UNIDADE_ID,
        registro: registroStr,
      });
      return c.json(
        {
          id: created.id,
          email: created.email,
          nome: created.nome,
          registro: created.registro,
        },
        201,
      );
    } catch (e: unknown) {
      const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
      if (code === "P2002") {
        throw new AppError("conflict", "E-mail já cadastrado.", 409);
      }
      throw e;
    }
  });

  v1.post("/dev/sanitize", async (c) => {
    const rec = await readJsonBody(c);
    const input = rec.input;
    if (typeof input !== "string" || !input.trim()) {
      throw new AppError("validation_error", "Campo `input` é obrigatório.", 400);
    }

    let gateway: ReturnType<typeof mcpGateway>;
    let sanitized: string;
    try {
      gateway = mcpGateway();
      sanitized = await gateway.sanitizeForModel(input);
    } catch (e: unknown) {
      throw devUpstreamAppError("Sanitize (MCP / clinical-ai)", e);
    }
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

    let gateway: ReturnType<typeof mcpGateway>;
    let sanitized: string;
    try {
      gateway = mcpGateway();
      sanitized = await gateway.sanitizeForModel(input);
    } catch (e: unknown) {
      throw devUpstreamAppError("Sanitize antes do Ollama", e);
    }

    const llm = new OllamaStreamClient();
    let out = "";
    try {
      for await (const token of llm.streamInsight(sanitized)) {
        out += token;
        if (out.length >= maxChars) {
          out = out.slice(0, maxChars);
          break;
        }
      }
    } catch (e: unknown) {
      throw devUpstreamAppError("Ollama (insight)", e);
    }

    return c.json({
      gateway: gateway.kind,
      sanitizedChars: sanitized.length,
      output: out,
      truncated: out.length >= maxChars,
    });
  });

  v1.get("/dev/clinical-ai/health", async (_c) => {
    const { status, bodyText, contentType } = await proxyClinicalAi("/health", { method: "GET" }, "clinical-ai /health");
    return new Response(bodyText, {
      status,
      headers: contentType ? { "content-type": contentType } : undefined,
    });
  });

  v1.post("/dev/rag/test/query", async (c) => {
    const bodyText = JSON.stringify(await readJsonBody(c));
    const { status, bodyText: out, contentType } = await proxyClinicalAi(
      "/rag/test/query",
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: bodyText,
      },
      "RAG /rag/test/query",
    );
    return new Response(out, {
      status,
      headers: contentType ? { "content-type": contentType } : undefined,
    });
  });

  v1.post("/dev/rag/test/rebuild", async (c) => {
    const force = c.req.query("force");
    const upstreamPath = force === "true" ? "/rag/test/rebuild?force=true" : "/rag/test/rebuild";
    const { status, bodyText, contentType } = await proxyClinicalAi(
      upstreamPath,
      {
        method: "POST",
        headers: { accept: "application/json" },
      },
      "RAG /rag/test/rebuild",
    );
    return new Response(bodyText, {
      status,
      headers: contentType ? { "content-type": contentType } : undefined,
    });
  });

  v1.post("/dev/mcp/test/direct-question", async (c) => {
    const bodyText = JSON.stringify(await readJsonBody(c));
    const { status, bodyText: out, contentType } = await proxyClinicalAi(
      "/mcp/test/direct-question",
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: bodyText,
      },
      "MCP /mcp/test/direct-question",
    );
    return new Response(out, {
      status,
      headers: contentType ? { "content-type": contentType } : undefined,
    });
  });

  v1.post("/dev/mcp/test/direct-question-stream", async (c) => {
    const base = clinicalAiBaseUrl();
    if (!base) {
      throw new AppError("service_unavailable", "Defina CLINICAL_AI_URL no Codigo/.env para usar proxies RAG/MCP.", 503);
    }
    const bodyText = JSON.stringify(await readJsonBody(c));
    const root = normalizeHttpBase(base);
    let upstream: Response;
    let release: (() => void) | null = null;
    try {
      release = clinicalAiProxyConcurrencyLimiter.acquire();
      upstream = await fetch(`${root}/mcp/test/direct-question-stream`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/x-ndjson, application/json",
        },
        body: bodyText,
      });
    } catch (e: unknown) {
      release?.();
      throw devUpstreamAppError("MCP /mcp/test/direct-question-stream", e);
    }
    if (!upstream.ok || !upstream.body) {
      let fallbackText: string;
      try {
        fallbackText = await upstream.text();
      } catch (e: unknown) {
        release?.();
        throw devUpstreamAppError("MCP /mcp/test/direct-question-stream (corpo da resposta)", e);
      }
      release?.();
      return new Response(fallbackText, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8" },
      });
    }
    const reader = upstream.body.getReader();
    const releaseStreamSlot = () => {
      release?.();
      release = null;
    };
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            releaseStreamSlot();
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (e) {
          releaseStreamSlot();
          controller.error(e);
        }
      },
      async cancel() {
        releaseStreamSlot();
        await reader.cancel();
      },
    });
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  });
}

