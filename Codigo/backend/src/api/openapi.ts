import type { HealthPayload } from "../services/healthService.js";

type OpenApiDoc = {
  openapi: "3.0.0" | "3.1.0";
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
  security?: Array<Record<string, string[]>>;
  paths: Record<string, unknown>;
  tags?: Array<{ name: string; description?: string }>;
};

export function buildOpenApiDoc(baseUrl = "/"): OpenApiDoc {
  const healthSchema = {
    type: "object",
    required: ["status", "db", "mcpConfigured", "privacyGateway", "timestamp"],
    properties: {
      status: { type: "string", enum: ["ok", "degraded", "fail"] satisfies HealthPayload["status"][] },
      db: { type: "boolean" },
      mcpConfigured: { type: "boolean" },
      privacyGateway: { type: "string", enum: ["noop", "remote"] satisfies HealthPayload["privacyGateway"][] },
      timestamp: { type: "string", format: "date-time" },
      ollamaConfigured: { type: "boolean" },
    },
  };

  return {
    openapi: "3.0.0",
    info: {
      title: "SUS Pré-Natal API",
      version: "v1",
      description: "Documentação mínima para testes manuais no Dev Sandbox.",
    },
    servers: [
      { url: baseUrl, description: "Servidor atual" },
      { url: "http://localhost:3000", description: "Dev local (backend)" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        HealthPayload: healthSchema,
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Infra"],
          summary: "Health check",
          responses: {
            200: {
              description: "OK",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthPayload" } } },
            },
            503: {
              description: "Fail",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthPayload" } } },
            },
          },
        },
      },
      "/api/v1/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login (público)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", example: "admin@local" },
                    password: { type: "string", example: "admin" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      token: { type: "string" },
                      profissional: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/pacientes": {
        get: {
          tags: ["Clínico"],
          summary: "Listar pacientes",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } },
        },
        post: {
          tags: ["Clínico"],
          summary: "Cadastrar paciente",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: { 200: { description: "OK" }, 400: { description: "Validation error" } },
        },
      },
      "/api/v1/pacientes/{id}": {
        get: {
          tags: ["Clínico"],
          summary: "Detalhar paciente",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
        },
      },
      "/api/v1/consultas/disponiveis-stream": {
        get: {
          tags: ["Streaming"],
          summary: "Listar consultas disponíveis para streaming",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "OK" } },
        },
      },
      "/ws/consultation/{id}": {
        get: {
          tags: ["Streaming"],
          summary: "WebSocket de consulta (token via querystring)",
          description:
            "Upgrade WebSocket. Use `?token=JWT` na URL. Eventos: history/ready, envio binário de áudio e `{\"type\":\"vad_pause\"}`.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 101: { description: "Switching Protocols (WebSocket)" } },
        },
      },
      "/api/v1/dev/sanitize": {
        post: {
          tags: ["Dev"],
          summary: "Sanitização via gateway MCP (modo real/noop)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["input"],
                  properties: { input: { type: "string" } },
                },
              },
            },
          },
          responses: { 200: { description: "OK" }, 400: { description: "Bad request" } },
        },
      },
      "/api/v1/dev/ollama/insight": {
        post: {
          tags: ["Dev"],
          summary: "Executar insight via Ollama (retorno agregado, sem stream)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["input"],
                  properties: { input: { type: "string" }, maxChars: { type: "number", default: 1500 } },
                },
              },
            },
          },
          responses: { 200: { description: "OK" }, 400: { description: "Bad request" } },
        },
      },
    },
    tags: [
      { name: "Infra", description: "Status e saúde do sistema" },
      { name: "Auth", description: "Autenticação (JWT)" },
      { name: "Clínico", description: "Recursos clínicos (pacientes/gestações/consultas)" },
      { name: "Streaming", description: "Rotas usadas pelo pipeline de escriba e WS" },
      { name: "Dev", description: "Rotas auxiliares para testes manuais" },
    ],
  };
}

