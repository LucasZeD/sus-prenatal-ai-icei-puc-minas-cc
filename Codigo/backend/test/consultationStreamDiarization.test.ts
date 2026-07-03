import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/privacyMcpGateway.js", () => ({
  mcpGateway: () => ({
    kind: "noop" as const,
    sanitizeForModel: async (text: string) => text,
  }),
}));

vi.mock("../src/services/escribaInsightService.js", () => ({
  streamEscribaInsight: async function* () {
    yield "- **PERGUNTA:** Avaliar pressao arterial.";
  },
}));

vi.mock("../src/services/escribaExtractService.js", () => ({
  extractEscribaFields: async () => null,
}));

describe("ConsultationStreamSession diarizacao", () => {
  it("emite stt_diarized sem persistir TRANSCRICAO_DIARIZADA", async () => {
    const { ConsultationStreamSession } = await import("../src/services/consultationStreamService.js");

    const outbound: Array<{ type: string; segments?: Array<{ speaker: string; role: string; text: string }> }> = [];

    // STT stub com segmentos temporais (alimenta a fusao texto x turnos).
    const stt = {
      chunkMinMs: 2500,
      transcribeBuffer: async () => ({
        text: "Gestante com pressao elevada hoje. Sente dor de cabeca.",
        segments: [
          { start: 0, end: 2, text: "Gestante com pressao elevada hoje." },
          { start: 2, end: 4, text: "Sente dor de cabeca." },
        ],
      }),
    };

    // Diarization client configurado, devolvendo 2 locutores.
    const diarization = {
      isConfigured: () => true,
      diarizeUtterance: async () => [
        { start: 0, end: 2, speaker: "SPEAKER_00" },
        { start: 2, end: 4, speaker: "SPEAKER_01" },
      ],
    };

    const session = new ConsultationStreamSession(
      "consulta-test-id",
      (msg) => outbound.push(msg),
      stt as never,
      diarization as never,
    );
    session.setDiarizationEnabled(true);

    const prevMin = process.env.STREAM_RAG_MIN_CHARS;
    process.env.STREAM_RAG_MIN_CHARS = "3";

    // Chunk grande (>=12000 bytes) => SttChunkBuffer flush imediato => transcribeAndApply.
    await session.onBinaryAudio(new Uint8Array(16_000));
    await session.onVadPause();

    await vi.waitFor(
      () => {
        expect(outbound.some((m) => m.type === "stt_diarized")).toBe(true);
      },
      { timeout: 8000 },
    );

    if (prevMin === undefined) delete process.env.STREAM_RAG_MIN_CHARS;
    else process.env.STREAM_RAG_MIN_CHARS = prevMin;

    const diarMsg = outbound.find((m) => m.type === "stt_diarized");
    expect(diarMsg?.segments?.length).toBe(2);
    expect(diarMsg?.segments?.[0]).toEqual({
      speaker: "SPEAKER_00",
      role: "profissional",
      text: "Gestante com pressao elevada hoje.",
    });
    expect(diarMsg?.segments?.[1].role).toBe("gestante");
  });

  it("nao emite stt_diarized quando STT retorna so filler", async () => {
    const { ConsultationStreamSession } = await import("../src/services/consultationStreamService.js");

    const outbound: Array<{ type: string }> = [];

    const stt = {
      chunkMinMs: 2500,
      transcribeBuffer: async () => ({
        text: "Obrigado. Tchau.",
        segments: [
          { start: 0, end: 1, text: "Obrigado." },
          { start: 1, end: 2, text: "Tchau." },
        ],
      }),
    };

    const diarization = {
      isConfigured: () => true,
      diarizeUtterance: async () => [
        { start: 0, end: 1, speaker: "SPEAKER_00" },
        { start: 1, end: 2, speaker: "SPEAKER_01" },
      ],
    };

    const session = new ConsultationStreamSession(
      "consulta-filler-id",
      (msg) => outbound.push(msg),
      stt as never,
      diarization as never,
    );

    const prevMin = process.env.STREAM_RAG_MIN_CHARS;
    process.env.STREAM_RAG_MIN_CHARS = "3";

    await session.onBinaryAudio(new Uint8Array(16_000));
    await session.onVadPause();

    await new Promise((r) => setTimeout(r, 500));

    if (prevMin === undefined) delete process.env.STREAM_RAG_MIN_CHARS;
    else process.env.STREAM_RAG_MIN_CHARS = prevMin;

    expect(outbound.some((m) => m.type === "stt_diarized")).toBe(false);
    expect(outbound.some((m) => m.type === "stt_partial")).toBe(false);
  });
});
