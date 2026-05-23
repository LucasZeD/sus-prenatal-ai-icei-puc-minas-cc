import { describe, expect, it } from "vitest";
import { normalizeObstetricJargon } from "../src/lib/obstetricJargonNormalize.js";

const ROTEIRO_INPUT =
  "Paciente em IG de vinte duas semanas, BCF cento e quarenta, AU vinte, feto cefálico e dorso à esquerda. MF presentes.";
const ROTEIRO_EXPECTED =
  "Paciente em IG de 22 semanas, BCF 140, AU 20, feto cefálico e dorso à esquerda. MF presentes.";

describe("normalizeObstetricJargon", () => {
  it("normaliza frase de referencia do roteiro (Caso 6 em texto)", () => {
    expect(normalizeObstetricJargon(ROTEIRO_INPUT)).toBe(ROTEIRO_EXPECTED);
  });

  it("preserva texto sem jargao numerico por extenso", () => {
    const plain = "Gestante nega queixas. Retorno em 15 dias.";
    expect(normalizeObstetricJargon(plain)).toBe(plain);
  });
});
