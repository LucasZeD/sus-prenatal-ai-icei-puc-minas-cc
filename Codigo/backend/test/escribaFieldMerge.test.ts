import { describe, expect, it } from "vitest";
import {
  applyFieldsDelta,
  mergeExtractedFields,
  type ConsultaClinicalFields,
} from "../src/lib/escribaFieldMerge.js";

describe("mergeExtractedFields", () => {
  it("aplica campos vazios sem sobrescrever existentes", () => {
    const current: ConsultaClinicalFields = {
      peso: 70,
      queixa: "dor antiga",
    };
    const patch = {
      peso: 72.5,
      queixa: "nova dor",
      idade_gestacional: 28,
    };
    const delta = mergeExtractedFields(current, patch);
    expect(delta.peso).toBeUndefined();
    expect(delta.idade_gestacional).toBe(28);
    expect(delta.queixa).toContain("dor antiga");
    expect(delta.queixa).toContain("nova dor");
  });

  it("aceita PA 140/90 em patch numerico", () => {
    const current: ConsultaClinicalFields = {};
    const delta = mergeExtractedFields(current, {
      pa_sistolica: 140,
      pa_diastolica: 90,
    });
    expect(delta.pa_sistolica).toBe(140);
    expect(delta.pa_diastolica).toBe(90);
  });

  it("rejeita valores fora de faixa", () => {
    const current: ConsultaClinicalFields = {};
    const delta = mergeExtractedFields(current, {
      pa_sistolica: 400,
      peso: 10,
      idade_gestacional: 2,
    });
    expect(delta.pa_sistolica).toBeUndefined();
    expect(delta.peso).toBeUndefined();
    expect(delta.idade_gestacional).toBeUndefined();
  });

  it("normaliza mov_fetal", () => {
    const current: ConsultaClinicalFields = {};
    const delta = mergeExtractedFields(current, { mov_fetal: "preservado" });
    expect(delta.mov_fetal).toBe("Preservado");
  });

  it("applyFieldsDelta atualiza sessao", () => {
    const base: ConsultaClinicalFields = { peso: 70 };
    const next = applyFieldsDelta(base, { idade_gestacional: 30 });
    expect(next.peso).toBe(70);
    expect(next.idade_gestacional).toBe(30);
  });
});
