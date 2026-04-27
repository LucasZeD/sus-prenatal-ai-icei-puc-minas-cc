/**
 * Cliente mínimo para Ollama (`OLLAMA_HTTP_URL`). Sem URL configurada, não emite tokens.
 */
export class OllamaStreamClient {
  async *streamInsight(prompt: string): AsyncGenerator<string, void, undefined> {
    const base = process.env.OLLAMA_HTTP_URL?.trim();
    const model = process.env.OLLAMA_MODEL?.trim() || "llama3.2";
    if (!base || !prompt.trim()) {
      return;
    }

    const url = `${base.replace(/\/$/, "")}/api/generate`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`ollama_http_${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const j = JSON.parse(t) as { response?: string };
          if (typeof j.response === "string" && j.response.length > 0) {
            yield j.response;
          }
        } catch {
          /* linha parcial / ruído */
        }
      }
    }
  }
}
