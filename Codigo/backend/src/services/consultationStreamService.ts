import { gpuDemoGate } from "../lib/gpuDemoGate.js";
import { mcpGateway } from "../lib/privacyMcpGateway.js";
import {
  applyFieldsDelta,
  consultaRowToClinicalFields,
  escribaExtractEnabled,
  mergeExtractedFields,
  type ConsultaClinicalFields,
} from "../lib/escribaFieldMerge.js";
import { sanitizeProntuarioDraftFromClient } from "./escribaDraftContext.js";
import { FasterWhisperClient, type SttSegment } from "../lib/stt/fasterWhisperClient.js";
import { SttChunkBuffer } from "../lib/stt/sttChunkBuffer.js";
import { DiarizationClient } from "../lib/diarization/diarizationClient.js";
import {
  mergeTranscriptWithDiarization,
  type DiarizedTextSegment,
  type TextSegment,
} from "../lib/diarization/mergeDiarization.js";
import { normalizeObstetricJargon } from "../lib/obstetricJargonNormalize.js";
import { ConsultaRepository } from "../repository/consultaRepository.js";
import { streamEscribaInsight } from "./escribaInsightService.js";
import { extractEscribaFields } from "./escribaExtractService.js";
import {
  filterDiarizedSegments,
  filterSttSegments,
  hasClinicalSignal,
  isFillerOnly,
  isNoiseInsight,
  transcriptFingerprint,
} from "./escribaInsightFilters.js";

const SENTENCE_END = /[.!?…]\s*$/;
const DEBOUNCE_MS = Number.parseInt(process.env.STREAM_RAG_DEBOUNCE_MS ?? "1800", 10);
const MIN_FLUSH_CHARS = Number.parseInt(process.env.STREAM_RAG_MIN_CHARS ?? "28", 10);

/** Bloco de fala rotulado enviado ao cliente (rótulo editável pelo profissional). */
export type DiarizedOutboundSegment = { speaker: string; role: string; text: string };

export type StreamOutbound =
  | { type: "ready"; consultaId: string; diarizationAvailable: boolean }
  | { type: "history"; eventos: { tipo: string; payload: string; createdAt: string }[] }
  | { type: "stt_partial"; text: string }
  | { type: "stt_diarized"; segments: DiarizedOutboundSegment[] }
  | { type: "ia_reset" }
  | { type: "ia_token"; token: string }
  | { type: "ia_done" }
  | { type: "form_patch"; patch: Partial<ConsultaClinicalFields>; source: "ai_extract" }
  | { type: "error"; message: string };

function firstSpeakerRoleFromEnv(): "profissional" | "gestante" {
  return process.env.DIARIZATION_FIRST_SPEAKER_ROLE?.trim().toLowerCase() === "gestante"
    ? "gestante"
    : "profissional";
}

/**
 * Quando a diarização compartilha a mesma GPU do STT/LLM (demo single-GPU),
 * roteamos a requisição pelo árbitro `gpuDemoGate` para que ela entre na fila
 * em vez de disputar VRAM em paralelo. Mantenha `false` quando a diarização
 * roda em CPU ou em outra placa.
 */
function diarizationUsesGpuGate(): boolean {
  const raw = process.env.DIARIZATION_GPU_GATE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

// Teto defensivo do buffer de áudio efêmero do utterance (libera memória se o flush atrasar).
const UTTERANCE_AUDIO_MAX_BYTES = Number.parseInt(
  process.env.DIARIZATION_UTTERANCE_MAX_BYTES ?? "16777216",
  10,
);

function hasSentenceBoundary(text: string): boolean {
  const t = text.trimEnd();
  if (!t) return false;
  return SENTENCE_END.test(t) || t.endsWith("\n\n");
}

/**
 * Sessão por WebSocket: acúmulo efêmero de STT, debounce/VAD para insight,
 * sanitização MCP antes do Ollama e persistência de trechos commitados.
 */
export class ConsultationStreamSession {
  private sttLive = "";
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private ragRunning = false;
  private lastInsightFingerprint = "";
  private lastExtractFingerprint = "";
  private sessionFields: ConsultaClinicalFields;
  private readonly sttBuffer: SttChunkBuffer;
  // Buffer de áudio efêmero do utterance atual (mesmos chunks recebidos em onBinaryAudio).
  private utteranceAudioChunks: Uint8Array[] = [];
  private utteranceAudioBytes = 0;
  // Segmentos de transcrição do utterance, com tempos acumulados (para a fusão com a diarização).
  private utteranceSttSegments: TextSegment[] = [];
  private utteranceTimeOffset = 0;
  // Opt-in por sessão (human-in-the-loop). Desligado por padrão; o profissional liga na UI.
  private diarizationEnabled = false;
  /** Snapshot efemero do formulario (rascunho nao salvo) enviado pelo front. */
  private prontuarioDraft: Partial<ConsultaClinicalFields> = {};

  constructor(
    private readonly consultaId: string,
    private readonly send: (msg: StreamOutbound) => void,
    private readonly stt: FasterWhisperClient,
    private readonly diarization: DiarizationClient = new DiarizationClient(),
    initialSessionFields: ConsultaClinicalFields = {},
  ) {
    this.sttBuffer = new SttChunkBuffer(stt.chunkMinMs);
    this.sessionFields = { ...initialSessionFields };
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.resetUtteranceAudio();
    this.utteranceSttSegments = [];
    this.utteranceTimeOffset = 0;
    gpuDemoGate.setMicActive(false);
  }

  onMicState(active: boolean): void {
    gpuDemoGate.setMicActive(active);
    if (!active) {
      void this.flushSttBuffer();
    }
  }

  /** Atualiza rascunho do prontuario (nao persiste; sanitizado na entrada). */
  onProntuarioDraft(raw: Record<string, unknown>): void {
    this.prontuarioDraft = sanitizeProntuarioDraftFromClient(raw);
  }

  /** O serviço de diarização está configurado (deploy)? Independe do opt-in da sessão. */
  get diarizationAvailable(): boolean {
    return this.diarization.isConfigured();
  }

  /** Liga/desliga a diarização para esta sessão (toggle do profissional na UI). */
  setDiarizationEnabled(enabled: boolean): void {
    this.diarizationEnabled = enabled;
    if (!enabled) {
      // Para imediatamente de bufferizar e descarta o áudio já acumulado (efemeridade).
      this.resetUtteranceAudio();
      this.utteranceSttSegments = [];
      this.utteranceTimeOffset = 0;
    }
  }

  /** Diarização efetivamente ativa = serviço disponível E opt-in da sessão. */
  private diarizationActive(): boolean {
    return this.diarization.isConfigured() && this.diarizationEnabled;
  }

  async onBinaryAudio(chunk: ArrayBuffer | Uint8Array): Promise<void> {
    const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    this.bufferUtteranceAudio(u8);
    const merged = this.sttBuffer.push(u8);
    if (merged) {
      await this.transcribeAndApply(merged);
    }
  }

  /** Acumula o áudio do utterance em memória (descartado após a diarização). */
  private bufferUtteranceAudio(chunk: Uint8Array): void {
    if (!this.diarizationActive() || chunk.byteLength === 0) {
      return;
    }
    if (this.utteranceAudioBytes + chunk.byteLength > UTTERANCE_AUDIO_MAX_BYTES) {
      // Trecho longo demais sem flush: zera para preservar memória (diarização é best-effort).
      this.resetUtteranceAudio();
    }
    this.utteranceAudioChunks.push(chunk);
    this.utteranceAudioBytes += chunk.byteLength;
  }

  private resetUtteranceAudio(): void {
    this.utteranceAudioChunks = [];
    this.utteranceAudioBytes = 0;
  }

  /** Concatena e remove o áudio bufferizado do utterance (garante efemeridade). */
  private takeUtteranceAudio(): Uint8Array {
    if (this.utteranceAudioChunks.length === 0) {
      return new Uint8Array(0);
    }
    const merged = new Uint8Array(this.utteranceAudioBytes);
    let offset = 0;
    for (const c of this.utteranceAudioChunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    this.resetUtteranceAudio();
    return merged;
  }

  private accumulateUtteranceSegments(segments: SttSegment[] | undefined): void {
    if (!this.diarizationActive() || !Array.isArray(segments) || segments.length === 0) {
      return;
    }
    let lastEnd = 0;
    for (const s of segments) {
      this.utteranceSttSegments.push({
        start: s.start + this.utteranceTimeOffset,
        end: s.end + this.utteranceTimeOffset,
        text: s.text,
      });
      lastEnd = Math.max(lastEnd, s.end);
    }
    this.utteranceTimeOffset += lastEnd;
  }

  private async flushSttBuffer(): Promise<void> {
    const merged = this.sttBuffer.flush();
    if (merged) {
      await this.transcribeAndApply(merged);
    }
  }

  private async transcribeAndApply(merged: Uint8Array): Promise<void> {
    const partial = await this.stt.transcribeBuffer(this.consultaId, merged);
    if (!partial) {
      return;
    }
    const filteredSegments = filterSttSegments(partial.segments);
    const filteredText = filteredSegments
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!filteredText || isFillerOnly(filteredText)) {
      return;
    }
    this.accumulateUtteranceSegments(filteredSegments);
    await this.applySttPartial(filteredText, true);
  }

  /** Pausa VAD ou comando explícito do cliente: força avaliação do buffer atual. */
  async onVadPause(): Promise<void> {
    await this.flushSttBuffer();
    await this.flushRagReason("vad");
  }

  async applySttPartial(text: string, append = false): Promise<void> {
    const normalized = normalizeObstetricJargon(text.trim());
    if (append && this.sttLive.trim()) {
      this.sttLive = `${this.sttLive.trim()}\n${normalized}`;
    } else {
      this.sttLive = normalized;
    }
    this.send({ type: "stt_partial", text: this.sttLive });

    if (hasSentenceBoundary(this.sttLive)) {
      await this.flushRagReason("punctuation");
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.flushRagReason("debounce");
    }, DEBOUNCE_MS);
  }

  private flushRagReason(_reason: "vad" | "punctuation" | "debounce"): void {
    gpuDemoGate.scheduleLlmFlush(() => this.runLlmFlush());
  }

  private async runLlmFlush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const raw = normalizeObstetricJargon(this.sttLive.trim());
    if (raw.length === 0) {
      return;
    }
    if (raw.length < MIN_FLUSH_CHARS && !hasSentenceBoundary(raw)) {
      return;
    }
    if (this.ragRunning) {
      return;
    }

    this.ragRunning = true;
    const snapshot = raw;
    this.sttLive = "";

    // Trecho "fechado": diariza o áudio bufferizado (independente do resultado do LLM)
    // e descarta os buffers imediatamente (áudio efêmero).
    const audioSnapshot = this.takeUtteranceAudio();
    const segSnapshot = this.utteranceSttSegments;
    this.utteranceSttSegments = [];
    this.utteranceTimeOffset = 0;
    void this.maybeDiarize(audioSnapshot, filterSttSegments(segSnapshot));

    const releaseGpu = await gpuDemoGate.acquire("llm");
    try {
      const gateway = mcpGateway();
      const sanitized = (await gateway.sanitizeForModel(snapshot)).trim();
      if (!sanitized) {
        return;
      }

      const fp = transcriptFingerprint(sanitized);
      if (fp === this.lastInsightFingerprint) {
        return;
      }
      if (!hasClinicalSignal(sanitized)) {
        return;
      }

      await Promise.all([
        this.runInsightPipeline(sanitized, fp),
        this.runExtractPipeline(sanitized, fp),
      ]);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Falha no pipeline de IA.";
      const message =
        raw === "clinical_ai_url_missing"
          ? "clinical-ai indisponivel: defina CLINICAL_AI_URL no backend."
          : raw;
      this.send({ type: "error", message });
    } finally {
      releaseGpu();
      this.ragRunning = false;
    }
  }

  private async runInsightPipeline(sanitized: string, fp: string): Promise<void> {
    this.send({ type: "ia_reset" });
    let insight = "";
    for await (const token of streamEscribaInsight(this.consultaId, sanitized, this.prontuarioDraft)) {
      insight += token;
      this.send({ type: "ia_token", token });
    }

    const trimmed = insight.trim();
    if (!trimmed || isNoiseInsight(trimmed)) {
      this.send({ type: "ia_reset" });
      this.send({ type: "ia_done" });
      return;
    }

    this.lastInsightFingerprint = fp;
    this.send({ type: "ia_done" });
  }

  private async runExtractPipeline(sanitized: string, fp: string): Promise<void> {
    if (!escribaExtractEnabled()) {
      return;
    }
    if (fp === this.lastExtractFingerprint) {
      return;
    }

    const result = await extractEscribaFields(this.consultaId, sanitized, this.sessionFields);
    if (!result || Object.keys(result.patch).length === 0) {
      return;
    }

    const delta = mergeExtractedFields(this.sessionFields, result.patch);
    if (Object.keys(delta).length === 0) {
      return;
    }

    this.lastExtractFingerprint = fp;
    this.sessionFields = applyFieldsDelta(this.sessionFields, delta);
    this.send({ type: "form_patch", patch: delta, source: "ai_extract" });
  }

  /**
   * Diariza o áudio do trecho e mescla com a transcrição para produzir blocos {speaker, role, text}.
   * Emite `stt_diarized` (rótulos editáveis no front). Não persiste transcrição (RNF04).
   * Tolerante a falhas: se a diarização estiver desligada/indisponível, não faz nada.
   */
  private async maybeDiarize(audio: Uint8Array, sttSegments: TextSegment[]): Promise<void> {
    const usableSegments = filterSttSegments(sttSegments);
    if (!this.diarizationActive() || audio.byteLength === 0 || usableSegments.length === 0) {
      return;
    }

    let diar: Awaited<ReturnType<DiarizationClient["diarizeUtterance"]>> = null;
    // Em GPU compartilhada, espera a vez na fila do árbitro (não roda em paralelo
    // com STT/LLM). Em CPU, o gate fica desativado e a chamada segue direto — a
    // serialização do lado do serviço fica por conta de DIARIZATION_CONCURRENCY_LIMIT.
    const releaseGpu = diarizationUsesGpuGate() ? await gpuDemoGate.acquire("diarization") : null;
    try {
      diar = await this.diarization.diarizeUtterance(this.consultaId, audio);
    } catch {
      return;
    } finally {
      releaseGpu?.();
    }

    const merged: DiarizedTextSegment[] | null = mergeTranscriptWithDiarization(usableSegments, diar, {
      firstSpeakerRole: firstSpeakerRoleFromEnv(),
    });
    if (!merged || merged.length === 0) {
      return;
    }

    const filtered = filterDiarizedSegments(merged);
    if (filtered.length === 0) {
      return;
    }

    this.send({
      type: "stt_diarized",
      segments: filtered.map((m) => ({ speaker: m.speaker, role: m.role, text: m.text })),
    });
  }
}

export class ConsultationStreamService {
  private readonly consultas = new ConsultaRepository();
  private readonly stt = new FasterWhisperClient();
  private readonly diarization = new DiarizationClient();

  /** Serviço de diarização configurado no deploy (DIARIZATION_HTTP_URL). */
  get diarizationAvailable(): boolean {
    return this.diarization.isConfigured();
  }

  async createSession(consultaId: string, send: (msg: StreamOutbound) => void): Promise<ConsultationStreamSession> {
    const row = await this.consultas.findById(consultaId);
    const initialFields = row ? consultaRowToClinicalFields(row) : {};
    return new ConsultationStreamSession(
      consultaId,
      send,
      this.stt,
      this.diarization,
      initialFields,
    );
  }

  get consultaRepository(): ConsultaRepository {
    return this.consultas;
  }
}
