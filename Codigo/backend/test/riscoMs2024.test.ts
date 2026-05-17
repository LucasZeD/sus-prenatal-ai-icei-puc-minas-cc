import { describe, it, expect } from "vitest";
import { RiscoGestacional } from "../src/lib/prismaBarrel.js";
import {
  computeTipoRisco,
  type RiscoEstratificacaoAntecedentes,
  type RiscoEstratificacaoGestacao,
  type RiscoEstratificacaoInput,
  type RiscoEstratificacaoPaciente,
} from "../src/domain/riscoMs2024.js";

function emptyAntecedentes(): RiscoEstratificacaoAntecedentes {
  return {
    n_mortos_primeira_semana: null,
    n_mortos_apos_primeira_semana: null,
    n_nascidos_mortos: null,
    n_parto_prematuro: null,
    n_abortos: null,
    n_bebe_menos_dois_kilos_e_meio: null,
    n_bebe_mais_quatro_kilos_e_meio: null,
    is_gesta_ectopica: false,
    is_gesta_molar: false,
    is_hipertensao_familiar: false,
    is_gravidez_gemelar_familiar: false,
    is_diabetes_familiar: false,
    is_fumo: false,
    is_alcool: false,
    is_drogas: false,
    is_cardiopatia: false,
    is_tromboembolismo: false,
    is_infertilidade: false,
    is_isoimunizacao_rh: false,
    is_cirurgia_pelvica_uterina: false,
    is_final_gestacao_anterior_1_ano: false,
    is_sifilis: false,
  };
}

function emptyGestacao(): RiscoEstratificacaoGestacao {
  return {
    tipo_gravidez: null,
    is_hipertensao_arterial: false,
    is_diabetes_gestacional: false,
    is_cardiopatia: false,
    is_tromboembolismo: false,
    is_infeccao_urinaria: false,
    is_infertilidade: false,
    is_cirurgia_elvica_uterina: false,
    is_cirugia: false,
    tratamento_sifilis_dose_1: null,
    tratamento_sifilis_dose_2: null,
    tratamento_sifilis_dose_3: null,
  };
}

function baseInput(over: Partial<RiscoEstratificacaoInput> = {}): RiscoEstratificacaoInput {
  const paciente: RiscoEstratificacaoPaciente = { idade: 28, altura: 1.65, peso_pre_gestacional: 62 };
  const gestacao = emptyGestacao();
  const antecedentes = emptyAntecedentes();
  return { paciente, gestacao, antecedentes, ...over };
}

describe("computeTipoRisco (MS 2024, intermediario mapeado para ALTO)", () => {
  it("retorna HABITUAL sem criterios", () => {
    const r = computeTipoRisco(baseInput());
    expect(r.tipo_risco).toBe(RiscoGestacional.HABITUAL);
    expect(r.criterios).toEqual([]);
  });

  it("HAS na gestacao atual implica ALTO", () => {
    const g = emptyGestacao();
    g.is_hipertensao_arterial = true;
    const r = computeTipoRisco(baseInput({ gestacao: g }));
    expect(r.tipo_risco).toBe(RiscoGestacional.ALTO);
    expect(r.criterios).toContain("ALTO_HAS_GESTACAO_ATUAL");
  });

  it("idade 35 a 39 (intermediario) implica ALTO", () => {
    const r = computeTipoRisco(baseInput({ paciente: { idade: 37, altura: 1.65, peso_pre_gestacional: 62 } }));
    expect(r.tipo_risco).toBe(RiscoGestacional.ALTO);
    expect(r.criterios).toEqual(["INT_IDADE_35_A_39"]);
  });

  it("idade menor que 15 implica ALTO", () => {
    const r = computeTipoRisco(baseInput({ paciente: { idade: 14, altura: 1.55, peso_pre_gestacional: 48 } }));
    expect(r.tipo_risco).toBe(RiscoGestacional.ALTO);
    expect(r.criterios).toContain("ALTO_IDADE_MENOR_15");
  });

  it("idade 40 ou mais implica ALTO", () => {
    const r = computeTipoRisco(baseInput({ paciente: { idade: 41, altura: 1.6, peso_pre_gestacional: 70 } }));
    expect(r.tipo_risco).toBe(RiscoGestacional.ALTO);
    expect(r.criterios).toContain("ALTO_IDADE_40_OU_MAIS");
  });

  it("gravidez gemelar por texto implica ALTO", () => {
    const g = emptyGestacao();
    g.tipo_gravidez = "gemelar";
    const r = computeTipoRisco(baseInput({ gestacao: g }));
    expect(r.tipo_risco).toBe(RiscoGestacional.ALTO);
    expect(r.criterios).toContain("ALTO_GESTACAO_MULTIPLA");
  });

  it("IMC entre 30 e 39.9 implica ALTO via criterio intermediario", () => {
    const r = computeTipoRisco(
      baseInput({ paciente: { idade: 30, altura: 1.65, peso_pre_gestacional: 90 } }),
    );
    expect(r.tipo_risco).toBe(RiscoGestacional.ALTO);
    expect(r.criterios).toContain("INT_IMC_30_A_39_9");
  });

  it("IMC 40 ou mais implica ALTO", () => {
    const r = computeTipoRisco(
      baseInput({ paciente: { idade: 32, altura: 1.6, peso_pre_gestacional: 110 } }),
    );
    expect(r.tipo_risco).toBe(RiscoGestacional.ALTO);
    expect(r.criterios).toContain("ALTO_IMC_40_OU_MAIS");
  });

  it("criterio alto prevalece sobre intermediario", () => {
    const g = emptyGestacao();
    g.is_diabetes_gestacional = true;
    const a = emptyAntecedentes();
    a.is_fumo = true;
    const r = computeTipoRisco(
      baseInput({
        paciente: { idade: 36, altura: 1.65, peso_pre_gestacional: 75 },
        gestacao: g,
        antecedentes: a,
      }),
    );
    expect(r.tipo_risco).toBe(RiscoGestacional.ALTO);
    expect(r.criterios).toContain("ALTO_DIABETES_GESTACIONAL");
    expect(r.criterios).not.toContain("INT_IDADE_35_A_39");
    expect(r.criterios).not.toContain("INT_TABAGISMO");
  });
});
