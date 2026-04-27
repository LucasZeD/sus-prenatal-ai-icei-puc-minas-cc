import { ConsultaStreamEventoTipo } from "../lib/prismaBarrel.js";
import { mcpGateway } from "../lib/privacyMcpGateway.js";
import { OllamaStreamClient } from "../lib/llm/ollamaStreamClient.js";
import { FasterWhisperClient } from "../lib/stt/fasterWhisperClient.js";
import { ConsultaRepository } from "../repository/consultaRepository.js";

const SENTENCE_END = /[.!?…]\s*$/;
const DEBOUNCE_MS = Number.parseInt(process.env.STREAM_RAG_DEBOUNCE_MS ?? "900", 10);
const MIN_FLUSH_CHARS = Number.parseInt(process.env.STREAM_RAG_MIN_CHARS ?? "14", 10);

export type StreamOutbound =
  | { type: "ready"; consultaId: string }
  | { type: "history"; eventos: { tipo: string; payload: string; createdAt: string }[] }
  | { type: "stt_partial"; text: string }
  | { type: "ia_token"; token: string }
  | { type: "ia_done" }
  | { type: "error"; message: string };

function hasSentenceBoundary(text: string): boolean {
  const t = text.trimEnd();
  if (!t) return false;
  return SENTENCE_END.test(t) || t.endsWith("\n\n");
}

/**
 * Sessão por WebSocket: acúmulo efêmero de STT, debounce/VAD para RAG,
 * sanitização MCP antes do Ollama e persistência de trechos commitados.
 */
export class ConsultationStreamSession {
  private sttLive = "";
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private ragRunning = false;

  constructor(
    private readonly consultaId: string,
    private readonly send: (msg: StreamOutbound) => void,
    private readonly consultas: ConsultaRepository,
    private readonly stt: FasterWhisperClient,
    private readonly llm: OllamaStreamClient,
  ) {}

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  async onBinaryAudio(chunk: ArrayBuffer | Uint8Array): Promise<void> {
    const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const partial = await this.stt.transcribePartialChunk(this.consultaId, u8);
    if (partial) {
      await this.applySttPartial(partial);
    }
  }

  /** Pausa VAD ou comando explícito do cliente: força avaliação do buffer atual. */
  async onVadPause(): Promise<void> {
    await this.flushRagReason("vad");
  }

  async applySttPartial(text: string): Promise<void> {
    this.sttLive = text;
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

  private async flushRagReason(_reason: "vad" | "punctuation" | "debounce"): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const raw = this.sttLive.trim();
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

    try {
      const gateway = mcpGateway();
      const sanitized = (await gateway.sanitizeForModel(snapshot)).trim();
      if (!sanitized) {
        return;
      }

      await this.consultas.appendStreamEvento(this.consultaId, ConsultaStreamEventoTipo.TRANSCRICAO_SANITIZADA, sanitized);

      let insight = "";
      for await (const token of this.llm.streamInsight(sanitized)) {
        insight += token;
        this.send({ type: "ia_token", token });
      }

      if (insight.trim()) {
        await this.consultas.appendStreamEvento(this.consultaId, ConsultaStreamEventoTipo.IA_INSIGHT_COMPLETO, insight);
      }
      this.send({ type: "ia_done" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha no pipeline de IA.";
      this.send({ type: "error", message });
    } finally {
      this.ragRunning = false;
    }
  }
}

export class ConsultationStreamService {
  private readonly consultas = new ConsultaRepository();
  private readonly stt = new FasterWhisperClient();
  private readonly llm = new OllamaStreamClient();

  createSession(consultaId: string, send: (msg: StreamOutbound) => void): ConsultationStreamSession {
    return new ConsultationStreamSession(consultaId, send, this.consultas, this.stt, this.llm);
  }

  get consultaRepository(): ConsultaRepository {
    return this.consultas;
  }
}
