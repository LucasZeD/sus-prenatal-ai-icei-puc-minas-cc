import { sttConcurrencyLimiter } from "../concurrencyLimiter.js";

export type SttSegment = { start: number; end: number; text: string };
export type SttSpeaker = { id: number; label: string; text: string };
export type SttTranscription = {
  text: string;
  segments: SttSegment[];
  speakers: SttSpeaker[];
};

export type SttTranscribeFailureReason =
  | "not_configured"
  | "empty_chunk"
  | "network_error"
  | "http_error"
  | "empty_text"
  | "json_error";

export type SttTranscribeDiagnostic = {
  ok: boolean;
  transcription?: SttTranscription;
  reason?: SttTranscribeFailureReason;
  httpStatus?: number;
  upstreamError?: string;
  upstreamBody?: string;
  whisperUrl?: string;
};

/**
 * STT opcional (`WHISPER_HTTP_URL`). Sem serviço configurado, retorna `null` (sem parcial).
 */
export class FasterWhisperClient {
  get chunkMinMs(): number {
    const parsed = Number.parseInt(process.env.STT_CHUNK_MIN_MS ?? "2500", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2500;
  }

  private get whisperBaseUrl(): string | null {
    const base = process.env.WHISPER_HTTP_URL?.trim();
    return base || null;
  }

  isConfigured(): boolean {
    return Boolean(this.whisperBaseUrl);
  }

  async transcribeBuffer(
    _consultaId: string,
    chunk: Uint8Array,
    filename = "chunk.webm",
  ): Promise<SttTranscription | null> {
    const diag = await this.transcribeWithDiagnostic(_consultaId, chunk, filename);
    return diag.ok && diag.transcription ? diag.transcription : null;
  }

  /** Diagnóstico completo (dev sandbox / logs). */
  async transcribeWithDiagnostic(
    _consultaId: string,
    chunk: Uint8Array,
    filename = "chunk.webm",
  ): Promise<SttTranscribeDiagnostic> {
    const whisperUrl = this.whisperBaseUrl;
    if (!whisperUrl) {
      return { ok: false, reason: "not_configured", whisperUrl: undefined };
    }
    if (chunk.byteLength === 0) {
      return { ok: false, reason: "empty_chunk", whisperUrl };
    }

    const safeName = filename.trim() || "chunk.webm";
    const ext = safeName.includes(".") ? safeName.slice(safeName.lastIndexOf(".")) : ".webm";
    const mime = ext === ".webm" ? "audio/webm" : "application/octet-stream";
    const url = `${whisperUrl.replace(/\/$/, "")}/v1/audio/transcriptions`;
    const form = new FormData();
    form.append("file", new Blob([chunk], { type: mime }), safeName);
    form.append("model", "whisper-1");
    if ((process.env.STT_USE_PREPROCESS ?? "true").toLowerCase() !== "false") {
      form.append("preprocess", "true");
    }

    let res: Response;
    try {
      res = await sttConcurrencyLimiter.run(() => fetch(url, { method: "POST", body: form }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: "network_error", upstreamError: msg, whisperUrl };
    }

    const bodyText = await res.text();
    if (!res.ok) {
      let upstreamError: string | undefined;
      try {
        const parsed = JSON.parse(bodyText) as { error?: string; message?: string };
        upstreamError =
          typeof parsed.error === "string"
            ? parsed.error
            : typeof parsed.message === "string"
              ? parsed.message
              : undefined;
      } catch {
        upstreamError = bodyText.slice(0, 300) || undefined;
      }
      return {
        ok: false,
        reason: "http_error",
        httpStatus: res.status,
        upstreamError,
        upstreamBody: bodyText.slice(0, 800),
        whisperUrl,
      };
    }

    let body: { text?: unknown; segments?: unknown; speakers?: unknown; error?: unknown };
    try {
      body = JSON.parse(bodyText) as typeof body;
    } catch {
      return {
        ok: false,
        reason: "json_error",
        httpStatus: res.status,
        upstreamBody: bodyText.slice(0, 800),
        whisperUrl,
      };
    }

    if (typeof body.error === "string" && body.error.trim()) {
      return {
        ok: false,
        reason: "http_error",
        httpStatus: res.status,
        upstreamError: body.error,
        upstreamBody: bodyText.slice(0, 800),
        whisperUrl,
      };
    }

    if (typeof body.text !== "string" || !body.text.trim()) {
      return {
        ok: false,
        reason: "empty_text",
        httpStatus: res.status,
        upstreamBody: bodyText.slice(0, 800),
        whisperUrl,
      };
    }

    const segments = Array.isArray(body.segments)
      ? body.segments
          .filter((s): s is { start: number; end: number; text: string } => {
            return (
              typeof s === "object" &&
              s !== null &&
              typeof (s as { start?: unknown }).start === "number" &&
              typeof (s as { end?: unknown }).end === "number" &&
              typeof (s as { text?: unknown }).text === "string"
            );
          })
          .map((s) => ({ start: s.start, end: s.end, text: s.text }))
      : [];
    const speakers = Array.isArray(body.speakers)
      ? body.speakers
          .filter((s): s is { id: number; label: string; text: string } => {
            return (
              typeof s === "object" &&
              s !== null &&
              typeof (s as { id?: unknown }).id === "number" &&
              typeof (s as { label?: unknown }).label === "string" &&
              typeof (s as { text?: unknown }).text === "string"
            );
          })
          .map((s) => ({ id: s.id, label: s.label, text: s.text }))
      : [];

    return {
      ok: true,
      transcription: { text: body.text, segments, speakers },
      whisperUrl,
    };
  }
}
