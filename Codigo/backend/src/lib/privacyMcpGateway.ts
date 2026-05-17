import { normalizeHttpBase } from "./httpUrl.js";
import { sanitizeConcurrencyLimiter } from "./concurrencyLimiter.js";
import { stripUntrustedLlmText } from "./promptInjectionSanitize.js";

export type PrivacyGatewayKind = "http" | "noop";

export type McpPrivacyGateway = {
  readonly kind: PrivacyGatewayKind;
  sanitizeForModel(text: string): Promise<string>;
};

function noopGateway(): McpPrivacyGateway {
  return {
    kind: "noop",
    sanitizeForModel: async (text: string) => stripUntrustedLlmText(text),
  };
}

function httpGateway(baseUrl: string): McpPrivacyGateway {
  const root = normalizeHttpBase(baseUrl);
  return {
    kind: "http",
    sanitizeForModel: async (text: string) => {
      const pre = stripUntrustedLlmText(text);
      const res = await sanitizeConcurrencyLimiter.run(() =>
        fetch(`${root}/sanitize`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: pre }),
        }),
      );
      const textBody = await res.text();
      if (!res.ok) {
        throw new Error(`mcp_sanitize_http_${res.status}`);
      }
      let body: { output?: string; sanitized?: string };
      try {
        body = JSON.parse(textBody) as { output?: string; sanitized?: string };
      } catch {
        throw new Error("mcp_sanitize_invalid_json");
      }
      const out = typeof body.output === "string" ? body.output : typeof body.sanitized === "string" ? body.sanitized : "";
      return stripUntrustedLlmText(out);
    },
  };
}

/** Gateway usado no pipeline de streaming / rota `/dev/sanitize`. `CLINICAL_AI_URL` tem prioridade (POST /sanitize). */
export function mcpGateway(): McpPrivacyGateway {
  const clinical = process.env.CLINICAL_AI_URL?.trim();
  if (clinical) {
    return httpGateway(clinical);
  }
  const url = process.env.MCP_SERVER_URL?.trim();
  if (!url) {
    return noopGateway();
  }
  return httpGateway(url);
}

/** Visão resumida para health-check (sem instanciar cliente HTTP extra). */
export function getPrivacyGateway(): { kind: PrivacyGatewayKind } {
  const clinical = process.env.CLINICAL_AI_URL?.trim();
  if (clinical) {
    return { kind: "http" };
  }
  const url = process.env.MCP_SERVER_URL?.trim();
  return { kind: url ? "http" : "noop" };
}
