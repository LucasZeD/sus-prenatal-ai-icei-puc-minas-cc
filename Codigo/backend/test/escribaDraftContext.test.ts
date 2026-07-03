import { describe, expect, it } from "vitest";
import {
  formatProntuarioDraftContext,
  sanitizeProntuarioDraftFromClient,
} from "../src/services/escribaDraftContext.js";

describe("escribaDraftContext", () => {
  it("formata PA do rascunho com cabecalho explicito", () => {
    const text = formatProntuarioDraftContext({
      pa_sistolica: 140,
      pa_diastolica: 90,
    });
    expect(text).toContain("Rascunho do prontuario");
    expect(text).toContain("nao salvo");
    expect(text).toContain("PA (rascunho): 140/90 mmHg");
  });

  it("retorna vazio quando nao ha campos", () => {
    expect(formatProntuarioDraftContext({})).toBe("");
  });

  it("rejeita PA fora da faixa no sanitize", () => {
    const out = sanitizeProntuarioDraftFromClient({
      pa_sistolica: 999,
      pa_diastolica: 90,
    });
    expect(out.pa_sistolica).toBeUndefined();
    expect(out.pa_diastolica).toBe(90);
  });
});
