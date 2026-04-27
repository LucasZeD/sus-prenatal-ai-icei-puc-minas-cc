export type PrivacyGatewayKind = "http" | "noop";

export type McpPrivacyGateway = {
  readonly kind: PrivacyGatewayKind;
  sanitizeForModel(text: string): Promise<string>;
};

function noopGateway(): McpPrivacyGateway {
  return {
    kind: "noop",
    sanitizeForModel: async (text: string) => text,
  };
}

function httpGateway(baseUrl: string): McpPrivacyGateway {
  const root = baseUrl.replace(/\/$/, "");
  return {
    kind: "http",
    sanitizeForModel: async (text: string) => {
      const res = await fetch(`${root}/sanitize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: text }),
      });
      if (!res.ok) {
        throw new Error(`mcp_sanitize_http_${res.status}`);
      }
      const body = (await res.json()) as { output?: string; sanitized?: string };
      const out = typeof body.output === "string" ? body.output : typeof body.sanitized === "string" ? body.sanitized : "";
      return out;
    },
  };
}

/** Gateway usado no pipeline de streaming / rota `/dev/sanitize`. */
export function mcpGateway(): McpPrivacyGateway {
  const url = process.env.MCP_SERVER_URL?.trim();
  if (!url) {
    return noopGateway();
  }
  return httpGateway(url);
}

/** Visão resumida para health-check (sem instanciar cliente HTTP extra). */
export function getPrivacyGateway(): { kind: PrivacyGatewayKind } {
  const url = process.env.MCP_SERVER_URL?.trim();
  return { kind: url ? "http" : "noop" };
}
