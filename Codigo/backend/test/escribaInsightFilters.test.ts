import { describe, expect, it } from "vitest";
import {
  filterDiarizedSegments,
  filterSttSegments,
  hasClinicalSignal,
  isFillerOnly,
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

  it("isFillerOnly detecta cumprimentos e alucinações comuns", () => {
    expect(isFillerOnly("Obrigado.")).toBe(true);
    expect(isFillerOnly("Tchau")).toBe(true);
    expect(isFillerOnly("Boa noite")).toBe(true);
    expect(isFillerOnly("Amém")).toBe(true);
    expect(isFillerOnly("Aplausos")).toBe(true);
    expect(isFillerOnly("Gestante com pressao elevada.")).toBe(false);
  });

  it("filterSttSegments remove filler e mantém clínico", () => {
    const segments = [
      { start: 0, end: 1, text: "Obrigado." },
      { start: 1, end: 3, text: "Gestante com dor lombar." },
      { start: 3, end: 4, text: "Tchau" },
    ];
    expect(filterSttSegments(segments)).toEqual([
      { start: 1, end: 3, text: "Gestante com dor lombar." },
    ]);
  });

  it("filterDiarizedSegments remove blocos filler", () => {
    const segments = [
      { speaker: "SPEAKER_00", role: "profissional", text: "Obrigado." },
      { speaker: "SPEAKER_01", role: "gestante", text: "Sente dor de cabeca." },
    ];
    expect(filterDiarizedSegments(segments)).toEqual([
      { speaker: "SPEAKER_01", role: "gestante", text: "Sente dor de cabeca." },
    ]);
  });

  it("hasClinicalSignal rejeita filler e aceita queixa clinica", () => {
    expect(hasClinicalSignal("ok")).toBe(false);
    expect(hasClinicalSignal("Gestante com pressao elevada e cefaleia.")).toBe(true);
  });

  it("transcriptFingerprint normaliza espacos", () => {
    expect(transcriptFingerprint("  Dor   Lombar ")).toBe("dor lombar");
  });
});
