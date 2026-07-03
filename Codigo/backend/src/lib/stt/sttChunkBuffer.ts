/**
 * Acumula chunks WebM do browser até STT_CHUNK_MIN_MS antes de enviar ao serviço STT.
 */
export class SttChunkBuffer {
  private chunks: Uint8Array[] = [];
  private accumulatedMs = 0;

  constructor(private readonly minMs: number) {}

  /**
   * Estimativa de duração por frame WS.
   * Um único WebM grande (stop-and-send do browser) conta como janela completa.
   */
  push(chunk: Uint8Array, chunkDurationMs?: number): Uint8Array | null {
    if (chunk.byteLength === 0) {
      return null;
    }
    this.chunks.push(chunk);
    const duration =
      chunkDurationMs ??
      (this.chunks.length === 1 && chunk.byteLength >= 12_000 ? this.minMs : 400);
    this.accumulatedMs += duration;
    if (this.accumulatedMs >= this.minMs) {
      return this.flush();
    }
    return null;
  }

  flush(): Uint8Array | null {
    if (this.chunks.length === 0) {
      return null;
    }
    const total = this.chunks.reduce((n, c) => n + c.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of this.chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    this.chunks = [];
    this.accumulatedMs = 0;
    return merged;
  }
}
