import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/privacyMcpGateway.js", () => ({
  mcpGateway: () => ({
    kind: "noop" as const,
    sanitizeForModel: async (text: string) => text,
  }),
}));

vi.mock("../src/services/escribaInsightService.js", () => ({
  streamEscribaInsight: async function* () {
    yield "- **PERGUNTA:** Avaliar pressao arterial e proteinuria.";
  },
}));

vi.mock("../src/services/escribaExtractService.js", () => ({
  extractEscribaFields: async () => ({
    patch: {
      queixa: "dor lombar",
      idade_gestacional: 28,
      peso: 72,
      pa_sistolica: 140,
      pa_diastolica: 90,
    },
    confidence: {},
    sources: {},
  }),
}));

describe("ConsultationStreamSession", () => {
  it("emite form_patch e insight sem persistir transcricao", async () => {
    const { ConsultationStreamSession } = await import("../src/services/consultationStreamService.js");

    const outbound: { type: string; patch?: unknown }[] = [];
    const session = new ConsultationStreamSession(
      "consulta-test-id",
      (msg) => outbound.push(msg),
      { transcribeBuffer: async () => "" } as never,
    );

    const prevMin = process.env.STREAM_RAG_MIN_CHARS;
    process.env.STREAM_RAG_MIN_CHARS = "3";

    await session.applySttPartial(
      "Gestante com 28 semanas, peso 72 kg, pressao 140 por 90, queixa de dor lombar.",
      false,
    );
    await session.onVadPause();

    await vi.waitFor(
      () => {
        expect(outbound.some((m) => m.type === "form_patch")).toBe(true);
      },
      { timeout: 8000 },
    );

    if (prevMin === undefined) delete process.env.STREAM_RAG_MIN_CHARS;
    else process.env.STREAM_RAG_MIN_CHARS = prevMin;

    expect(outbound.some((m) => m.type === "ia_reset")).toBe(true);
    expect(outbound.some((m) => m.type === "ia_done")).toBe(true);
    const patchMsg = outbound.find((m) => m.type === "form_patch");
    expect(patchMsg?.patch).toMatchObject({
      queixa: "dor lombar",
      idade_gestacional: 28,
    });
  });

  it("nao chama LLM para trecho sem sinal clinico", async () => {
    const { ConsultationStreamSession } = await import("../src/services/consultationStreamService.js");
    const outbound: { type: string }[] = [];
    const session = new ConsultationStreamSession(
      "consulta-test-id",
      (msg) => outbound.push(msg),
      { transcribeBuffer: async () => "" } as never,
    );

    await session.applySttPartial("ok.", false);
    await session.onVadPause();

    await new Promise((r) => setTimeout(r, 400));
    expect(outbound.some((m) => m.type === "ia_token")).toBe(false);
    expect(outbound.some((m) => m.type === "form_patch")).toBe(false);
  });
});
