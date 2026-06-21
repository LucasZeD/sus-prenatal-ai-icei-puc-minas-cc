import { describe, expect, it } from "vitest";
import {
  hasClinicalSignal,
  isNoiseInsight,
  transcriptFingerprint,
} from "../src/services/escribaInsightFilters.js";

describe("escribaInsightFilters", () => {
  it("isNoiseInsight detecta respostas negativas repetidas", () => {
    const noise = `PERGUNTA: Nenhuma.
CONDUTA: Nenhuma.
ALERTA: Nenhuma.`;
    expect(isNoiseInsight(noise)).toBe(true);
    expect(isNoiseInsight("_Sem sugestoes neste trecho._")).toBe(true);
    expect(isNoiseInsight("- **PERGUNTA:** Avaliar movimentos fetais hoje.")).toBe(false);
  });

  it("hasClinicalSignal rejeita filler e aceita queixa clinica", () => {
    expect(hasClinicalSignal("ok")).toBe(false);
    expect(hasClinicalSignal("Gestante com pressao elevada e cefaleia.")).toBe(true);
  });

  it("transcriptFingerprint normaliza espacos", () => {
    expect(transcriptFingerprint("  Dor   Lombar ")).toBe("dor lombar");
  });
});
