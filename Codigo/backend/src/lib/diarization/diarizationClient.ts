import { diarizationConcurrencyLimiter } from "../concurrencyLimiter.js";

/** Turno de locutor devolvido pelo serviço de diarização (tempos em segundos). */
export type DiarSegment = { start: number; end: number; speaker: string };

export type DiarizeOptions = {
  numSpeakers?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
  /** Nome/MIME do arquivo enviado (default: webm, igual aos chunks do MediaRecorder). */
  filename?: string;
};

export type DiarizeFailureReason =
  | "not_configured"
  | "empty_chunk"
  | "network_error"
  | "http_error"
  | "json_error";

export type DiarizeDiagnostic = {
  ok: boolean;
  segments?: DiarSegment[];
  numSpeakers?: number;
  reason?: DiarizeFailureReason;
  httpStatus?: number;
  upstreamError?: string;
  diarizationUrl?: string;
};

function mimeForFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".pcm") || lower.endsWith(".raw")) return "audio/pcm";
  return "application/octet-stream";
}

/**
 * Diarização opcional (`DIARIZATION_HTTP_URL`). Sem serviço configurado, retorna `null`
 * (mesma filosofia do `FasterWhisperClient`: stub sem rede externa, fluxo segue normal).
 */
export class DiarizationClient {
  private get baseUrl(): string | null {
    const base = process.env.DIARIZATION_HTTP_URL?.trim();
    return base || null;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  /** Diariza o áudio efêmero de um trecho; `null` quando desativado ou em falha. */
  async diarizeUtterance(
    _consultaId: string,
    audio: Uint8Array,
    options: DiarizeOptions = {},
  ): Promise<DiarSegment[] | null> {
    const diag = await this.diarizeWithDiagnostic(_consultaId, audio, options);
    return diag.ok && diag.segments ? diag.segments : null;
  }

  /** Diagnóstico completo (dev sandbox / logs sem conteúdo de áudio). */
  async diarizeWithDiagnostic(
    _consultaId: string,
    audio: Uint8Array,
    options: DiarizeOptions = {},
  ): Promise<DiarizeDiagnostic> {
    const diarizationUrl = this.baseUrl;
    if (!diarizationUrl) {
      return { ok: false, reason: "not_configured" };
    }
    if (audio.byteLength === 0) {
      return { ok: false, reason: "empty_chunk", diarizationUrl };
    }

    const filename = options.filename?.trim() || "utterance.webm";
    const url = `${diarizationUrl.replace(/\/$/, "")}/v1/diarize`;
    const form = new FormData();
    form.append("file", new Blob([audio], { type: mimeForFilename(filename) }), filename);
    if (typeof options.numSpeakers === "number") form.append("num_speakers", String(options.numSpeakers));
    if (typeof options.minSpeakers === "number") form.append("min_speakers", String(options.minSpeakers));
    if (typeof options.maxSpeakers === "number") form.append("max_speakers", String(options.maxSpeakers));

    let res: Response;
    try {
      res = await diarizationConcurrencyLimiter.run(() => fetch(url, { method: "POST", body: form }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: "network_error", upstreamError: msg, diarizationUrl };
    }

    const bodyText = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        reason: "http_error",
        httpStatus: res.status,
        upstreamError: bodyText.slice(0, 300) || undefined,
        diarizationUrl,
      };
    }

    let body: { segments?: unknown; num_speakers?: unknown; error?: unknown };
    try {
      body = JSON.parse(bodyText) as typeof body;
    } catch {
      return { ok: false, reason: "json_error", httpStatus: res.status, diarizationUrl };
    }

    if (typeof body.error === "string" && body.error.trim()) {
      return { ok: false, reason: "http_error", httpStatus: res.status, upstreamError: body.error, diarizationUrl };
    }

    const segments = parseSegments(body.segments);
    const numSpeakers =
      typeof body.num_speakers === "number"
        ? body.num_speakers
        : new Set(segments.map((s) => s.speaker)).size;

    return { ok: true, segments, numSpeakers, diarizationUrl };
  }
}

function parseSegments(raw: unknown): DiarSegment[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((s): s is { start: number; end: number; speaker: string } => {
      return (
        typeof s === "object" &&
        s !== null &&
        typeof (s as { start?: unknown }).start === "number" &&
        typeof (s as { end?: unknown }).end === "number" &&
        typeof (s as { speaker?: unknown }).speaker === "string"
      );
    })
    .map((s) => ({ start: s.start, end: s.end, speaker: s.speaker }))
    .sort((a, b) => a.start - b.start);
}
