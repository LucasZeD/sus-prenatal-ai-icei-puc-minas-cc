/**
 * STT opcional (`WHISPER_HTTP_URL`). Sem serviço configurado, retorna `null` (sem parcial).
 */
export class FasterWhisperClient {
  async transcribePartialChunk(_consultaId: string, _chunk: Uint8Array): Promise<string | null> {
    const base = process.env.WHISPER_HTTP_URL?.trim();
    if (!base || _chunk.byteLength === 0) {
      return null;
    }

    const url = `${base.replace(/\/$/, "")}/v1/audio/transcriptions`;
    const form = new FormData();
    form.append(
      "file",
      new Blob([_chunk], { type: "application/octet-stream" }),
      "chunk.pcm",
    );
    form.append("model", "whisper-1");

    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { text?: string };
    return typeof body.text === "string" ? body.text : null;
  }
}
