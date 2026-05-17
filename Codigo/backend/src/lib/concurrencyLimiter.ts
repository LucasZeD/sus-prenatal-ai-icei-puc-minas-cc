export class ConcurrencyLimitExceededError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConcurrencyLimitExceededError";
  }
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export class ConcurrencyLimiter {
  private active = 0;

  constructor(
    private readonly maxActive: number,
    private readonly code: string,
    private readonly message: string,
  ) {}

  acquire(): () => void {
    if (this.active >= this.maxActive) {
      throw new ConcurrencyLimitExceededError(this.code, this.message);
    }

    let released = false;
    this.active += 1;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active = Math.max(0, this.active - 1);
    };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export const sanitizeConcurrencyLimiter = new ConcurrencyLimiter(
  parsePositiveIntEnv("SANITIZE_CONCURRENCY_LIMIT", 4),
  "sanitize_busy",
  "Sanitização temporariamente ocupada. Tente novamente em instantes.",
);

// Defaults conservadores para demo single-GPU: 1 LLM ativo no Ollama; o proxy aceita 2
// (1 ativo + 1 esperando o slot interno do Ollama) e rejeita a 3ª com 429.
// Override via .env (LLM_CONCURRENCY_LIMIT, CLINICAL_AI_PROXY_CONCURRENCY_LIMIT) quando a GPU comportar mais.
export const llmConcurrencyLimiter = new ConcurrencyLimiter(
  parsePositiveIntEnv("LLM_CONCURRENCY_LIMIT", 1),
  "llm_busy",
  "Serviço de IA temporariamente ocupado. Tente novamente em instantes.",
);

export const sttConcurrencyLimiter = new ConcurrencyLimiter(
  parsePositiveIntEnv("STT_CONCURRENCY_LIMIT", 2),
  "stt_busy",
  "Transcrição temporariamente ocupada. Tente novamente em instantes.",
);

export const clinicalAiProxyConcurrencyLimiter = new ConcurrencyLimiter(
  parsePositiveIntEnv("CLINICAL_AI_PROXY_CONCURRENCY_LIMIT", 2),
  "clinical_ai_proxy_busy",
  "clinical-ai temporariamente ocupado. Tente novamente em instantes.",
);
