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
    required: [
      "status",
      "db",
      "mcpConfigured",
      "privacyGateway",
      "timestamp",
      "ollamaConfigured",
      "ollamaReachable",
      "clinicalAiConfigured",
      "clinicalAiReachable",
      "clinicalAiGeminiConfigured",
    ],
    properties: {
      status: { type: "string", enum: ["ok", "degraded", "fail"] satisfies HealthPayload["status"][] },
      db: { type: "boolean" },
      mcpConfigured: { type: "boolean" },
      privacyGateway: { type: "string", enum: ["noop", "remote"] satisfies HealthPayload["privacyGateway"][] },
      timestamp: { type: "string", format: "date-time" },
      ollamaConfigured: { type: "boolean", description: "OLLAMA_HTTP_URL definida" },
      ollamaReachable: { type: "boolean", description: "GET Ollama /api/tags OK" },
      clinicalAiConfigured: { type: "boolean", description: "CLINICAL_AI_URL definida" },
      clinicalAiReachable: { type: "boolean", description: "GET clinical-ai /health OK" },
      clinicalAiGeminiConfigured: {
        type: "boolean",
        description: "clinical-ai /health reportou gemini_configured (GEMINI_API_KEY definida no servico)",
      },
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
      {
        url: baseUrl,
        description:
          "API Hono: /api/v1/*, /health, /swagger. Use este servidor no Try it out do Swagger (rotas deste documento).",
      },
      { url: "http://localhost:3000", description: "Backend (localhost)" },
      { url: "http://127.0.0.1:3000", description: "Backend (127.0.0.1)" },
      {
        url: "http://localhost:4010",
        description:
          "clinical-ai (FastAPI): documentacao em /docs; /health, /rag/test/*, /mcp/*. Nao expoe as rotas /api/v1 deste OpenAPI.",
      },
      { url: "http://127.0.0.1:4010", description: "clinical-ai (127.0.0.1)" },
      {
        url: "http://localhost:11434",
        description: "Ollama nativo: /api/tags, /api/generate. Apenas referencia; nao e a API Hono.",
      },
      { url: "http://127.0.0.1:11434", description: "Ollama (127.0.0.1)" },
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
      "/api/v1/clinical/livia/context": {
        post: {
          tags: ["Clínico"],
          summary:
            "Montar texto de gestacao_context + consulta_escriba_context para MCP (filtro heuristico pela pergunta)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["question"],
                  properties: {
                    question: { type: "string" },
                    paciente_id: { type: "string", format: "uuid", nullable: true },
                    gestacao_id: { type: "string", format: "uuid", nullable: true },
                    consulta_id: { type: "string", format: "uuid", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description:
                "OK — textos ja sanitizados (PII) via clinical-ai antes de expor ao browser; dupla camada ao enviar ao stream.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["gestacao_context", "consulta_escriba_context"],
                    properties: {
                      gestacao_context: { type: "string" },
                      consulta_escriba_context: { type: "string" },
                    },
                  },
                },
              },
            },
            400: { description: "Validação" },
            404: { description: "Não encontrado" },
            503: { description: "Sanitização / clinical-ai indisponível" },
          },
        },
      },
      "/api/v1/clinical/livia/suggestions": {
        post: {
          tags: ["Clínico"],
          summary: "Sugestões de pergunta para a Lívia (dados estruturados da gestação; sem texto livre de queixa)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    paciente_id: { type: "string", format: "uuid", nullable: true },
                    gestacao_id: { type: "string", format: "uuid", nullable: true },
                    consulta_id: { type: "string", format: "uuid", nullable: true },
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
                    required: ["suggestions"],
                    properties: {
                      suggestions: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            400: { description: "Validação" },
            404: { description: "Não encontrado" },
          },
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
      "/api/v1/dev/profissionais/eligibility": {
        get: {
          tags: ["Dev"],
          summary: "Indica se criação de profissional via Dev está ativa e se o JWT é de admin",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } },
        },
      },
      "/api/v1/dev/profissionais": {
        post: {
          tags: ["Dev"],
          summary: "Criar profissional (somente com DEV_ALLOW_PROFISSIONAL_CREATE=1 e e-mail admin)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password", "nome"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 8 },
                    nome: { type: "string", minLength: 2 },
                    registro: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Criado" },
            400: { description: "Validação" },
            403: { description: "Não é admin dev" },
            404: { description: "Feature desligada" },
            409: { description: "E-mail duplicado" },
          },
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
      "/api/v1/dev/stt/transcribe": {
        post: {
          tags: ["Dev"],
          summary: "Teste isolado de STT (faster-whisper) sem UUID de consulta",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: { type: "string", format: "binary", description: "Trecho de áudio (WebM/Opus)." },
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
                    required: ["text", "segments", "speakers", "latencyMs"],
                    properties: {
                      text: { type: "string" },
                      latencyMs: { type: "number" },
                      segments: {
                        type: "array",
                        items: {
                          type: "object",
                          required: ["start", "end", "text"],
                          properties: {
                            start: { type: "number" },
                            end: { type: "number" },
                            text: { type: "string" },
                          },
                        },
                      },
                      speakers: {
                        type: "array",
                        items: {
                          type: "object",
                          required: ["id", "label", "text"],
                          properties: {
                            id: { type: "number" },
                            label: { type: "string" },
                            text: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "Payload inválido" },
            503: { description: "STT indisponível / WHISPER_HTTP_URL ausente" },
          },
        },
      },
      "/api/v1/dev/clinical-ai/health": {
        get: {
          tags: ["Dev"],
          summary: "Proxy para health do serviço clinical-ai (requer CLINICAL_AI_URL)",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "OK" }, 503: { description: "CLINICAL_AI_URL não configurado" } },
        },
      },
      "/api/v1/dev/rag/test/query": {
        post: {
          tags: ["Dev"],
          summary: "Proxy RAG: POST /rag/test/query no clinical-ai",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "OK" }, 503: { description: "Serviço indisponível" } },
        },
      },
      "/api/v1/dev/rag/test/rebuild": {
        post: {
          tags: ["Dev"],
          summary: "Proxy RAG: reconstruir índice no clinical-ai",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "OK" }, 503: { description: "Serviço indisponível" } },
        },
      },
      "/api/v1/dev/mcp/test/direct-question": {
        post: {
          tags: ["Dev"],
          summary: "Proxy MCP: pergunta direta (RAG + PII + Ollama chat)",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "OK" }, 503: { description: "Serviço indisponível" } },
        },
      },
      "/api/v1/dev/mcp/test/direct-question-stream": {
        post: {
          tags: ["Dev"],
          summary:
            "Proxy MCP: pergunta direta em NDJSON (pipeline + stream). Body JSON aceita `llm_provider`: ollama | gemini | auto (RAG/embeddings ainda dependem do Ollama).",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["question"],
                  properties: {
                    question: { type: "string" },
                    think: { type: "boolean", nullable: true },
                    llm_provider: { type: "string", enum: ["ollama", "gemini", "auto"] },
                    gestacao_context: { type: "string", nullable: true },
                    consulta_escriba_context: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Stream application/x-ndjson" },
            503: { description: "Serviço indisponível" },
          },
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

