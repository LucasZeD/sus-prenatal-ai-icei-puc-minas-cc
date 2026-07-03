import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiarizationClient } from "../src/lib/diarization/diarizationClient.js";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("DiarizationClient", () => {
  let prevUrl: string | undefined;

  beforeEach(() => {
    prevUrl = process.env.DIARIZATION_HTTP_URL;
  });

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.DIARIZATION_HTTP_URL;
    else process.env.DIARIZATION_HTTP_URL = prevUrl;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("retorna null e nao chama rede quando DIARIZATION_HTTP_URL esta vazio (stub desligado)", async () => {
    delete process.env.DIARIZATION_HTTP_URL;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new DiarizationClient();
    expect(client.isConfigured()).toBe(false);

    const out = await client.diarizeUtterance("c1", new Uint8Array([1, 2, 3]));
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retorna null para chunk vazio mesmo configurado", async () => {
    process.env.DIARIZATION_HTTP_URL = "http://diarization:8001";
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const out = await new DiarizationClient().diarizeUtterance("c1", new Uint8Array(0));
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("faz POST para /v1/diarize e parseia os segmentos ordenados", async () => {
    process.env.DIARIZATION_HTTP_URL = "http://diarization:8001/";
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({
        segments: [
          { start: 2.0, end: 3.0, speaker: "SPEAKER_01" },
          { start: 0.0, end: 1.5, speaker: "SPEAKER_00" },
        ],
        num_speakers: 2,
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new DiarizationClient();
    const out = await client.diarizeUtterance("c1", new Uint8Array([1, 2, 3, 4]));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("http://diarization:8001/v1/diarize");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);

    expect(out).not.toBeNull();
    expect(out).toEqual([
      { start: 0.0, end: 1.5, speaker: "SPEAKER_00" },
      { start: 2.0, end: 3.0, speaker: "SPEAKER_01" },
    ]);
  });

  it("retorna null em erro HTTP do servico", async () => {
    process.env.DIARIZATION_HTTP_URL = "http://diarization:8001";
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 })) as unknown as typeof fetch;

    const out = await new DiarizationClient().diarizeUtterance("c1", new Uint8Array([9]));
    expect(out).toBeNull();
  });

  it("retorna null em falha de rede", async () => {
    process.env.DIARIZATION_HTTP_URL = "http://diarization:8001";
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const diag = await new DiarizationClient().diarizeWithDiagnostic("c1", new Uint8Array([9]));
    expect(diag.ok).toBe(false);
    expect(diag.reason).toBe("network_error");
  });
});
