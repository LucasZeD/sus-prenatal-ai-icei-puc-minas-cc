import { normalizeHttpBase } from "../lib/httpUrl.js";
import { getPrivacyGateway } from "../lib/privacyMcpGateway.js";
import { pingDb } from "../repository/healthRepository.js";

export type HealthPayload = {
  status: "ok" | "degraded" | "fail";
  db: boolean;
  mcpConfigured: boolean;
  privacyGateway: "noop" | "remote";
  ollamaConfigured: boolean;
  /** true se `GET /api/tags` respondeu OK na `OLLAMA_HTTP_URL` (normalizada). */
  ollamaReachable: boolean;
  /** `CLINICAL_AI_URL` definido. */
  clinicalAiConfigured: boolean;
  /** true se `GET /health` do clinical-ai respondeu OK. */
  clinicalAiReachable: boolean;
  /** true se o clinical-ai reportou `gemini_configured` no /health (chave API definida). */
  clinicalAiGeminiConfigured: boolean;
  timestamp: string;
};

async function probeGetOk(url: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function probeClinicalAiHealth(
  baseUrl: string,
  timeoutMs = 2500,
): Promise<{ reachable: boolean; geminiConfigured: boolean }> {
  const url = `${baseUrl.replace(/\/$/, "")}/health`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { reachable: false, geminiConfigured: false };
    }
    const j = (await res.json()) as { gemini_configured?: unknown };
    return { reachable: true, geminiConfigured: Boolean(j.gemini_configured) };
  } catch {
    return { reachable: false, geminiConfigured: false };
  }
}

export async function getHealthStatus(): Promise<{ httpStatus: 200 | 503; body: HealthPayload }> {
  const timestamp = new Date().toISOString();
  const clinicalRaw = process.env.CLINICAL_AI_URL?.trim();
  const mcpRaw = process.env.MCP_SERVER_URL?.trim();
  const mcpConfigured = Boolean(clinicalRaw || mcpRaw);
  const gateway = getPrivacyGateway();

  const ollamaRaw = process.env.OLLAMA_HTTP_URL?.trim();
  const ollamaConfigured = Boolean(ollamaRaw);
  const ollamaBase = normalizeHttpBase(ollamaRaw);
  const ollamaReachable = ollamaBase ? await probeGetOk(`${ollamaBase}/api/tags`) : false;

  const clinicalAiConfigured = Boolean(clinicalRaw);
  const clinicalBase = normalizeHttpBase(clinicalRaw);
  const clinicalProbe = clinicalBase ? await probeClinicalAiHealth(clinicalBase) : { reachable: false, geminiConfigured: false };
  const clinicalAiReachable = clinicalProbe.reachable;
  const clinicalAiGeminiConfigured = clinicalProbe.geminiConfigured;

  let db = false;
  try {
    await pingDb();
    db = true;
  } catch {
    db = false;
  }

  const bodyBase: Omit<HealthPayload, "status"> = {
    db,
    mcpConfigured,
    privacyGateway: gateway.kind === "http" ? "remote" : "noop",
    ollamaConfigured,
    ollamaReachable,
    clinicalAiConfigured,
    clinicalAiReachable,
    clinicalAiGeminiConfigured,
    timestamp,
  };

  if (!db) {
    return {
      httpStatus: 503,
      body: {
        status: "fail",
        ...bodyBase,
      },
    };
  }

  const degraded = gateway.kind === "noop";

  return {
    httpStatus: 200,
    body: {
      status: degraded ? "degraded" : "ok",
      ...bodyBase,
    },
  };
}
