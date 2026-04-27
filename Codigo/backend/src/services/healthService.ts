import { getPrivacyGateway } from "../lib/privacyMcpGateway.js";
import { pingDb } from "../repository/healthRepository.js";

export type HealthPayload = {
  status: "ok" | "degraded" | "fail";
  db: boolean;
  mcpConfigured: boolean;
  privacyGateway: "noop" | "remote";
  ollamaConfigured: boolean;
  timestamp: string;
};

export async function getHealthStatus(): Promise<{ httpStatus: 200 | 503; body: HealthPayload }> {
  const timestamp = new Date().toISOString();
  const mcpConfigured = Boolean(process.env.MCP_SERVER_URL?.trim());
  const gateway = getPrivacyGateway();
  const ollamaConfigured = Boolean(process.env.OLLAMA_HTTP_URL?.trim());

  let db = false;
  try {
    await pingDb();
    db = true;
  } catch {
    db = false;
  }

  if (!db) {
    return {
      httpStatus: 503,
      body: {
        status: "fail",
        db: false,
        mcpConfigured,
        privacyGateway: gateway.kind === "http" ? "remote" : "noop",
        ollamaConfigured,
        timestamp,
      },
    };
  }

  const degraded = !mcpConfigured || gateway.kind === "noop";

  return {
    httpStatus: 200,
    body: {
      status: degraded ? "degraded" : "ok",
      db: true,
      mcpConfigured,
      privacyGateway: gateway.kind === "http" ? "remote" : "noop",
      ollamaConfigured,
      timestamp,
    },
  };
}
