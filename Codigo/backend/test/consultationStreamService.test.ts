import { describe, expect, it, vi } from "vitest";
import { ConsultaStreamEventoTipo } from "../src/lib/prismaBarrel.js";

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

describe("ConsultationStreamSession", () => {
  it("persiste apenas eventos de stream, nao consulta_ia", async () => {
    const { ConsultationStreamSession } = await import("../src/services/consultationStreamService.js");

    const appendStreamEvento = vi.fn().mockResolvedValue(undefined);
    const consultas = { appendStreamEvento };

    const outbound: { type: string }[] = [];
    const session = new ConsultationStreamSession(
      "consulta-test-id",
      (msg) => outbound.push(msg),
      consultas as never,
      { transcribeBuffer: async () => "" } as never,
    );

    const prevMin = process.env.STREAM_RAG_MIN_CHARS;
    process.env.STREAM_RAG_MIN_CHARS = "3";

    await session.applySttPartial(
      "Gestante com pressao elevada. Nova afericao em quinze minutos.",
      false,
    );
    await session.onVadPause();

    await vi.waitFor(
      () => {
        expect(appendStreamEvento.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 8000 },
    );

    if (prevMin === undefined) delete process.env.STREAM_RAG_MIN_CHARS;
    else process.env.STREAM_RAG_MIN_CHARS = prevMin;

    const tipos = appendStreamEvento.mock.calls.map((c) => c[1]);
    expect(tipos).toContain(ConsultaStreamEventoTipo.TRANSCRICAO_SANITIZADA);
    expect(tipos).toContain(ConsultaStreamEventoTipo.IA_INSIGHT_COMPLETO);
    expect(outbound.some((m) => m.type === "ia_reset")).toBe(true);
    expect(outbound.some((m) => m.type === "ia_done")).toBe(true);
  });

  it("nao chama LLM para trecho sem sinal clinico", async () => {
    const { ConsultationStreamSession } = await import("../src/services/consultationStreamService.js");
    const appendStreamEvento = vi.fn().mockResolvedValue(undefined);
    const outbound: { type: string }[] = [];
    const session = new ConsultationStreamSession(
      "consulta-test-id",
      (msg) => outbound.push(msg),
      { appendStreamEvento } as never,
      { transcribeBuffer: async () => "" } as never,
    );

    await session.applySttPartial("ok.", false);
    await session.onVadPause();

    await new Promise((r) => setTimeout(r, 400));
    expect(outbound.some((m) => m.type === "ia_token")).toBe(false);
  });
});
