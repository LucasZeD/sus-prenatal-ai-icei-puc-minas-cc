/**
 * Coordena uso da GPU em demo single-device: STT (Whisper) vs LLM (Ollama) não rodam em paralelo.
 */

export type GpuJobKind = "stt" | "llm";

export type GpuDemoMode = "time_slice" | "exclusive_stt" | "livia_cloud";

function parseMode(): GpuDemoMode {
  const raw = (process.env.GPU_DEMO_MODE ?? "time_slice").trim().toLowerCase();
  if (raw === "exclusive_stt" || raw === "livia_cloud") {
    return raw;
  }
  return "time_slice";
}

class GpuDemoGateImpl {
  private mode = parseMode();
  private holder: GpuJobKind | null = null;
  private waitQueue: { kind: GpuJobKind; resolve: () => void }[] = [];
  private micActive = false;
  private pendingLlmFlush: (() => void) | null = null;

  getMode(): GpuDemoMode {
    return this.mode;
  }

  setMicActive(active: boolean): void {
    this.micActive = active;
    if (!active && this.mode === "exclusive_stt" && this.pendingLlmFlush) {
      const fn = this.pendingLlmFlush;
      this.pendingLlmFlush = null;
      fn();
    }
  }

  isMicActive(): boolean {
    return this.micActive;
  }

  /** Em exclusive_stt com mic ligado, adia flush LLM até parar o microfone. */
  scheduleLlmFlush(run: () => void | Promise<void>): void {
    if (this.mode === "exclusive_stt" && this.micActive) {
      this.pendingLlmFlush = () => {
        void run();
      };
      return;
    }
    void run();
  }

  async acquire(kind: GpuJobKind): Promise<() => void> {
    if (this.mode === "livia_cloud") {
      return () => {};
    }

    if (this.holder === kind) {
      return () => {};
    }

    if (this.holder === null) {
      this.holder = kind;
      return () => this.release(kind);
    }

    await new Promise<void>((resolve) => {
      this.waitQueue.push({ kind, resolve });
    });

    this.holder = kind;
    return () => this.release(kind);
  }

  private release(kind: GpuJobKind): void {
    if (this.holder !== kind) {
      return;
    }
    this.holder = null;
    const next = this.waitQueue.shift();
    if (next) {
      next.resolve();
    }
  }
}

export const gpuDemoGate = new GpuDemoGateImpl();
